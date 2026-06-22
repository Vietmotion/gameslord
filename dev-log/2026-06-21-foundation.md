# Dev Log - 2026-06-21

## Current state
- The site already has a functional hub in `index.html`.
- Firebase auth is live in the hub.
- Play counts are stored in Firestore via `gamePlays`.
- High scores are stored in Firestore via `scores`.
- `profile.html` already gives the project a natural account page.

## Decision
Treat playplay.vn as one platform with many games, not a loose folder of unrelated HTML files.

## Why
- Login should be shared once across the whole site.
- Scores should use one consistent API and one consistent `gameId` system.
- Future items, unlocks, and purchases should belong to the player account, not to individual pages.
- The main page should become a catalog driven by data, not a manually duplicated set of cards.

## Structure target
- Hub page for discovery and navigation
- Profile page for account, stats, inventory, and purchases
- Shared Firebase-backed platform services
- Data-driven game catalog
- Consistent per-game routes

## Near-term next steps
1. Extract the game list into a shared catalog file.
2. Make the home page render cards from that catalog.
3. Extract shared auth and score logic out of `index.html`.
4. Add `inventories`, `catalogItems`, and `purchases` collections when the shop work starts.
5. Add one admin-safe path for feature flags such as `coming-soon`, `featured`, and `hidden`.

## Deployment
- Added a GitHub Pages workflow that publishes the static site from the repository root on push to `main`.

## Notes
- Keep the current live files working while migrating. Do not break existing direct links to game pages during the folder cleanup.

## Update - Evening Session

### Platform and operations
- Added owner-only admin console page (`admin.html`) with Firebase-backed metrics.
- Added admin entry button on hub for `viet.motiondesign@gmail.com`.
- Improved admin loading to handle partial Firestore permission failures instead of failing completely.

### Chess War iteration
- Added top menu/header and home navigation consistency.
- Removed turn-gated movement and moved to continuous piece updates.
- Added pre-fight preparation countdown and engagement lock behavior.
- Added in-fight behavior states (`seeking`, `engaged`, `defending`) and anti-oscillation movement rules.
- Added on-screen balance monitor and AI auto-test runner for fast balancing checks.

### Gun Rider iteration
- Added vehicle movement sound effect (`sfx/car1.mp3`) while moving.
- Added charging sound effect (`sfx/charging01.mp3`) while holding fire charge.
- Updated terrain sampling to use uniform scale with offset to reduce map stretching.
- Added first rule-based tile map terrain generation path behind mode switch (`ACTIVE_MAP_MODE`).

### Follow-up for next session
1. Finalize Firestore security rules for admin dashboard full access.
2. Move map/tile presets into external files (JSON) for easier authoring.
3. Add optional per-map metadata (spawn ranges, wind profile, water settings).
4. Continue SFX pass for shooting, impact, and UI feedback.