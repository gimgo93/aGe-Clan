# Courtyard and scene arrival — review draft

Previous renderer drew the complete town-courtyard-v4 illustration repeatedly with alternating horizontal and vertical mirrors. This repeated gates, walls and towers when zoomed out or panned. Original assets v2/v3/v4 remain preserved.

The replacement draws a single panorama, with camera scale and translation clamped to its coverage (including shake margin). Existing world coordinates, building interactions and game rules remain unchanged. A default view frames the gate, side walls and central paving; zoom/pan explores the same scene without repeating it.

Asset: public/game/assets/town-courtyard-wide-v5.webp, 1774 × 887, 563934 bytes. Produced with the built-in image generation tool, then encoded as WebP quality 88. Reference: town-courtyard-v4.webp. Original PNG retained at C:/Users/jjiho/.codex/generated_images/01a1aafd-e55f-7923-8513-db5a754c0695/exec-cd620b61-1d62-4610-ba97-e421aa388c05.png.

Prompt: Create one coherent wide panoramic medieval stone fortress interior matching the reference materials and atmosphere, elevated three-quarter RTS camera, one central main gate at the far top, continuous battlements to both sides, pine forest and mountains beyond. Vast mostly empty worn stone paving in the center and bottom 75%, no foreground enclosing wall. No characters, text or UI; no mirrored sections, tiling or duplicated gates. Broad 2:1 composition with consistent perspective and muted green banners.

Location title: cancel any previous arrival immediately on a scene/region/observer change, replace the text synchronously, then slide in over 460 ms. Ordinary HUD refresh does not restart the animation. Reduced motion bypasses the arrival. Existing exit never fades.

Fade: old-scene snapshot dissolves over 650 ms with a slower opening and smooth curve; slide remains 360 ms. Interrupted transitions cancel the previous snapshot safely.

Validation: 17 release check groups passed; world presentation camera coverage/transition cancellation/fade timing check passed; location arrival check passed; Sites build passed. Browser inspected solo battle/mine/town on narrow and 1366 × 768 screens with no console errors. No new PvP load or FPS benchmark. No deployment or GitHub write for this draft; awaiting visual approval requested earlier by the user.

Approved and deployed 2026-11-06: Sites saved version 62, source 2a19b55574dceb6bd70a4adf8a40f82af805b6c1, deployment appgdep_6aeda6b999e48191882f19cfb6619f00. Subsequent battlefield experiments are local preview only and excluded from this release.
