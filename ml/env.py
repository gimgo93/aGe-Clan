"""Gymnasium API backed by the unchanged JavaScript game engine."""
from __future__ import annotations

import json
import math
import os
from contextlib import suppress
from pathlib import Path
import queue
import subprocess
import threading

import gymnasium as gym
from gymnasium import spaces
import numpy as np


class AgeClanEnv(gym.Env):
    """One isolated Node process per environment; one action per frame_skip ticks."""

    metadata = {"render_modes": []}

    def __init__(self, *, frame_skip=10, max_ticks=6000, target_wave=0,
                 node_executable=None, response_timeout=30.0):
        super().__init__()
        for name, value, upper in (("frame_skip", frame_skip, 10000),
                                   ("max_ticks", max_ticks, 10000000),
                                   ("target_wave", target_wave, 1000)):
            if isinstance(value, bool) or not isinstance(value, int) or not (0 if name == "target_wave" else 1) <= value <= upper:
                raise ValueError(f"Invalid {name}")
        if not math.isfinite(response_timeout) or response_timeout <= 0:
            raise ValueError("response_timeout must be positive and finite")
        self.frame_skip, self.max_ticks, self.target_wave = frame_skip, max_ticks, target_wave
        self.response_timeout = response_timeout
        self._closed, self._needs_reset = False, True
        bridge = Path(__file__).resolve().with_name("bridge.mjs")
        self._process = subprocess.Popen(
            [node_executable or os.environ.get("AGE_CLAN_NODE", "node"), str(bridge)],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            # Engine diagnostics stay visible and cannot block on a full stderr pipe.
            stderr=None, text=True, encoding="utf-8", bufsize=1,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        self._responses = queue.Queue()
        self._reader = threading.Thread(target=self._read_responses, daemon=True)
        self._reader.start()
        try:
            spec = self._request({"op": "describe"})
            self.actions, self.feature_names = spec["actions"], spec["features"]
            self.action_space = spaces.Discrete(len(self.actions))
            low = np.zeros(len(self.feature_names), dtype=np.float32)
            for key in ("lightningResearch", "iceResearch"):
                low[self.feature_names.index(key)] = -1
            self.observation_space = spaces.Box(low, np.inf, dtype=np.float32)
        except BaseException:
            self.close()
            raise

    def _read_responses(self):
        try:
            for line in self._process.stdout:
                self._responses.put(line)
        finally:
            self._responses.put(None)

    def _request(self, message):
        if self._closed:
            raise RuntimeError("Environment is closed")
        try:
            self._process.stdin.write(json.dumps(message) + "\n")
            self._process.stdin.flush()
            line = self._responses.get(timeout=self.response_timeout)
            if line is None:
                self.close()
                raise RuntimeError(f"Node bridge exited (code {self._process.poll()})")
            response = json.loads(line)
        except (BrokenPipeError, OSError, queue.Empty, json.JSONDecodeError) as exc:
            self.close()
            raise RuntimeError("Node bridge communication failed; create a new environment") from exc
        if not response["ok"]:
            raise RuntimeError(response["error"])
        return response.get("data")

    def reset(self, *, seed=None, options=None):
        if options:
            raise ValueError("No reset options are supported")
        super().reset(seed=seed)
        # Gymnasium controls the RNG; the bridge accepts a portable uint32 seed.
        bridge_seed = int(self.np_random.integers(0, 2**32, dtype=np.uint64))
        result = self._request({"op": "reset", "seed": bridge_seed,
                                "frameSkip": self.frame_skip, "maxTicks": self.max_ticks,
                                "targetWave": self.target_wave})
        self._needs_reset = False
        return np.asarray(result["observation"], dtype=np.float32), result["info"]

    def step(self, action):
        if self._needs_reset:
            raise gym.error.ResetNeeded("Call reset before step or after episode end")
        if not self.action_space.contains(action):
            raise ValueError(f"Action must be in {self.action_space}")
        result = self._request({"op": "step", "action": int(action)})
        self._needs_reset = result["terminated"] or result["truncated"]
        return (np.asarray(result["observation"], dtype=np.float32), float(result["reward"]),
                bool(result["terminated"]), bool(result["truncated"]), result["info"])

    def action_masks(self):
        if self._needs_reset:
            raise gym.error.ResetNeeded('Call reset before requesting action masks')
        return np.asarray(self._request({'op': 'masks'}), dtype=np.bool_)

    def close(self):
        if getattr(self, "_closed", True):
            return
        self._closed = True
        process = self._process
        if process.poll() is None:
            try:
                process.stdin.write('{"op":"close"}\n')
                process.stdin.flush()
                process.wait(timeout=2)
            except (OSError, subprocess.TimeoutExpired):
                process.kill()
                process.wait(timeout=2)
        # Windows can raise EINVAL while flushing a pipe whose child has died.
        with suppress(OSError):
            process.stdin.close()
        self._reader.join(timeout=2)
        process.stdout.close()
