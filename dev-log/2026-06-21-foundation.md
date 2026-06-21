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