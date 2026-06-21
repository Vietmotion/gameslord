# playplay Workspace

This workspace contains multiple web games. As the project grows, this file helps you quickly find key functions, systems, and files to tweak.

## Product Direction
- [docs/site-architecture.md](docs/site-architecture.md) - Recommended structure for the game hub, player accounts, score storage, inventory, and shop features.
- [dev-log/2026-06-21-foundation.md](dev-log/2026-06-21-foundation.md) - Initial dev log entry capturing the current architecture and next build steps.
- [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml) - GitHub Pages deployment on push to `main`.

## Structure
- [index.html](index.html) – Main game hub (Firebase auth, play counts, global scores API)
- [01 - So many of them/SMOTgame.html](01%20-%20So%20many%20of%20them/SMOTgame.html) – SMOT game
- [04 - Gun Rider/gunrider.html](04%20-%20Gun%20Rider/gunrider.html) – Gun Rider game

## Shared Systems (Hub)
**File:** [index.html](index.html)
- Firebase init: `initFirebase()`
- Auth UI: `openAuthModal()`, `closeAuthModal()`, `toggleAuthMode()`, `handleAuth()`, `handleGoogleSignIn()`, `handleLogout()`
- Play counts: `recordGamePlay()`
- Global scores API (used by games): `window.GameScores`
  - `saveScore(gameId, score, playerName?)`
  - `getPlayerHighScore(gameId)`
  - `getLeaderboard(gameId, limit)`
  - `isLoggedIn()`

## SMOT (So Many Of Them)
**File:** [01 - So many of them/SMOTgame.html](01%20-%20So%20many%20of%20them/SMOTgame.html)
- Game over: `gameOver()`
- Scores/leaderboard:
  - `handleGameOverScores()`
  - `loadLeaderboard(gameId)`
  - `updateSidePanelLeaderboard()`
  - `updatePlayerBestScore()`
- Start screen high score: `loadStartScreenHighScore()`

## Gun Rider
**File:** [04 - Gun Rider/gunrider.html](04%20-%20Gun%20Rider/gunrider.html)
- Turn flow: `switchTurn()`, `processTurnSwitch()`
- Projectile: `fire()`, `updateProjectile()`
- Terrain: `initTerrain()`, `getTerrainHeight()`, `getTerrainSlope()`, `createCrater()`, `smoothTerrain()`
- Bot AI: `botCalculateMove()`, `updateBot()`
- Wind system:
  - `setNewWind()`
  - `updateWind()`
  - `getEffectiveWind()`
  - `updateWindIndicator()`

## Notes
- Scores and authentication use Firebase (configured in [index.html](index.html)).
- Each game can call the global API via `window.parent.GameScores` (if launched from the hub) or `window.GameScores` if embedded.

## Recommended Firebase Collections
- `users` - profile, display name, role, createdAt, lastSeenAt
- `gamePlays` - total play count per game
- `scores` - current best score per user per game
- `inventories` - owned items and currencies per user
- `catalogItems` - shop item definitions, prices, rarity, availability
- `purchases` - purchase history and transaction snapshots
- `gameProgress` - per-user progression, unlocks, save-state metadata

## Next Additions (Suggested Sections)
- Characters: stats, abilities, sprites
- Items: drop rules, effects
- Maps: terrain presets, hazards
- UI: HUD elements, menus
