# v58 release — 2026-11-06

Application release: **v58**. Production: https://ageclan.com/game/

## Deployed sources

- Sites source commit: `ed75b8a495346b1d4704c2cbba394303da7da51c`.
- Sites saved version: **60** (hosting sequence, independent of the game release label).
- Sites deployment: `appgdep_6aed1de3cba08191ab8f35084b2b798c`.
- Cloudflare Worker: `age-clan-pvp`, version `0c1e0a36-5e4e-4d76-a6f4-396585c63dc9`.
- GitHub application snapshot: `e17ee27df2d0365fcec7b456779e7f5150c64008`; main and release/v58 include this release record.

## Included

Restored bottom start menu with grouped friend room entry; four-player PvP and unique frontiers; parchment map and full-screen read-only spectating; clockwise speed cooldown; corrected castle-entry route; title version beside the game name; lower-left library links; drifting valley mist. Search metadata and icons from the previous production version are retained. Previous designs and GitHub-only operations documents are preserved.

## Validation

17 local release check groups passed. Disposable built Worker checks passed. Production two- and four-player WebSocket checks passed: countdown, simultaneous join, acknowledgments, retries, delta patches, independent waves, spectator scope, reconnect. Public API returned ready, v58 and capacity 4. Browser confirmed title and v58 without console errors. This is not a maximum-concurrency or browser FPS benchmark; Google sign-in and the entire game progression were not replayed in production.

## Storage and rollback

Existing D1 database, ClanRoom Durable Object namespace, backend/admin secrets and Google client setting were retained. No production schema migration, export or reset was run.

Previous frontend: Sites saved version 59 (`ef65d71b75306f48f8fd66034634b7399910749d`). Previous backend Worker: `3371a1f4-c92e-4bf9-a1bd-d87cd8fc87c0`. Previous GitHub main: `2a1b9161164e2eee8882da9f3e91674456f1832e`. Roll back frontend and backend together if protocol behavior requires it; do not reset live databases. GitHub history retains all previous commits and release/v58 provides the new source recovery point.
