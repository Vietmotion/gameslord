# playplay Workspace

This workspace contains multiple web games. As the project grows, this file helps you quickly find key functions, systems, and files to tweak.

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

## Next Additions (Suggested Sections)
- Characters: stats, abilities, sprites
- Items: drop rules, effects
- Maps: terrain presets, hazards
- UI: HUD elements, menus

## Reliable Push Process (Windows)
Use this checklist whenever game assets/folders (like map images or SVGs) must appear on GitHub and deploy to Pages.

1. Verify branch and file state.
```powershell
& 'C:\Program Files\Git\cmd\git.exe' -C 'e:\2026 - Personal Projects\03 - Free Web Game' status --short --branch
```

2. Stage exactly what you want to publish.
```powershell
& 'C:\Program Files\Git\cmd\git.exe' -C 'e:\2026 - Personal Projects\03 - Free Web Game' add -- '04 - Gun Rider/assets/js/gunrider.js' '04 - Gun Rider/gunrider.html' '04 - Gun Rider/map' '04 - Gun Rider/svg/char-catrket/projectile-1.svg' '04 - Gun Rider/svg/char-catrket/projectile-2.svg' '04 - Gun Rider/svg/char-catrket/projectile-3.svg' 'dev-log/2026-07-26-gun-rider-image-map-and-weapon-pass.md'
```

3. Commit.
```powershell
& 'C:\Program Files\Git\cmd\git.exe' -C 'e:\2026 - Personal Projects\03 - Free Web Game' commit -m 'Describe your Gun Rider update here'
```

4. Push to main.
```powershell
& 'C:\Program Files\Git\cmd\git.exe' -C 'e:\2026 - Personal Projects\03 - Free Web Game' push origin main
```

5. Confirm sync and check for accidental leftovers.
```powershell
& 'C:\Program Files\Git\cmd\git.exe' -C 'e:\2026 - Personal Projects\03 - Free Web Game' status --short --branch
```
Expected: `## main...origin/main` and only intentional untracked files.

6. Verify required map files are in the pushed commit.
```powershell
& 'C:\Program Files\Git\cmd\git.exe' -C 'e:\2026 - Personal Projects\03 - Free Web Game' ls-tree --name-only -r HEAD -- '04 - Gun Rider/map/map1-banhkeo'
```

7. Verify remote availability.
- Open this URL and confirm image loads:
  - `https://raw.githubusercontent.com/Vietmotion/playplay/main/04%20-%20Gun%20Rider/map/map1-banhkeo/island-main.png`

8. Verify live site update.
- Check Pages after push (allow a short deploy delay), then hard refresh (`Ctrl+F5`) if needed:
  - `https://playplay.vn/04%20-%20Gun%20Rider/gunrider.html`

Notes:
- If `git` is not recognized in terminal, use the full executable path shown above.
- Avoid committing temporary helper files unless intentional (for example `copilot-terminal-check.txt`).
