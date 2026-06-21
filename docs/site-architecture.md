# playplay.vn Site Architecture

## What already exists
- `index.html` already acts as the main hub.
- Firebase auth, profile entry points, play counting, and a shared `window.GameScores` API already exist in the hub.
- `profile.html` is already the right place for player identity, stats, and account-owned data.

Because those platform pieces already live in the hub, the cleanest structure is to make the hub the single platform shell and let each game stay focused on gameplay.

## Recommended site structure
Use three product layers.

### 1. Platform layer
Owns player identity and shared systems.

- Home hub: featured games, categories, latest updates, events
- Authentication: email and Google sign-in
- Player profile: display name, stats, recent scores, owned items
- Economy services: inventory, currencies, shop catalog, purchases
- Shared services: score save/load, play counts, achievements, cloud save hooks

### 2. Game layer
Each game should expose a small manifest and use shared platform APIs.

Per game, define:
- `id`: stable key such as `spacepong`
- `title`
- `path`
- `thumbnail`
- `status`: `live`, `beta`, `coming-soon`
- `categories`
- `supportsScores`
- `supportsInventory`
- `leaderboardMetric`: `score`, `time`, `wave`, etc.

The main page should render cards from that manifest instead of duplicating game metadata in large inline HTML blocks. That keeps adding a new game to one data entry plus one game file.

### 3. Content and ops layer
Owns dev logs, release notes, and deployment.

- `dev-log/` for dated product notes
- `docs/` for architecture and technical decisions
- `.github/workflows/` for validation and deployment

## Recommended repo shape
This is the target shape as the project grows. You do not need to move everything at once.

```text
/
  index.html
  profile.html
  firebase-standalone.js
  assets/
    css/
    js/
      platform/
        auth.js
        scores.js
        catalog.js
        inventory.js
      data/
        games.js
    img/
  games/
    so-many-of-them/
      index.html
      assets/
    tower-defense/
      index.html
      assets/
    space-pong/
      index.html
      assets/
    gun-rider/
      index.html
      assets/
    chess-war/
      index.html
      assets/
  docs/
  dev-log/
  .github/
    workflows/
```

## Linking games into the main page
Best approach:

1. Keep one central game catalog file.
2. Render game cards from that catalog.
3. Store each game's route, score support, and visibility in that same record.
4. Use the same `gameId` everywhere: card rendering, play counts, leaderboards, purchases, progression.

Example catalog shape:

```js
const games = [
  {
    id: 'spacepong',
    title: 'Space Pong',
    path: 'games/space-pong/index.html',
    thumbnail: 'games/space-pong/assets/thumbnail.png',
    status: 'live',
    categories: ['action'],
    supportsScores: true,
    supportsInventory: false
  }
];
```

That gives you one stable source for:
- hub rendering
- search/filtering
- featured sections
- profile stats per game
- shop item restrictions by game
- leaderboard and analytics mapping

## Firebase data model
Recommended collections:

### `users/{userId}`
- `displayName`
- `email`
- `photoURL`
- `createdAt`
- `lastSeenAt`
- `favoriteGameId`
- `currencies`: object such as `{ coins: 1200, gems: 15 }`

### `games/{gameId}`
- metadata mirrored from the catalog when needed for admin tools
- `status`
- `isFeatured`
- `publishedAt`

### `scores/{gameId__userId}`
Keep your current pattern for best-score lookup speed.

- `gameId`
- `userId`
- `score`
- `playerName`
- `timestamp`

### `gamePlays/{gameId}`
- `count`

### `inventories/{userId}`
- `currencies`
- `items`: array or keyed object of owned item ids and quantities
- `updatedAt`

### `catalogItems/{itemId}`
- `name`
- `type`: `skin`, `boost`, `consumable`, `unlock`
- `gameId`: nullable for site-wide items
- `price`
- `currency`
- `isActive`

### `purchases/{purchaseId}`
- `userId`
- `itemId`
- `price`
- `currency`
- `createdAt`
- `status`

### `gameProgress/{gameId__userId}`
- `level`
- `xp`
- `unlocks`
- `lastPlayedAt`
- optional save-state metadata

## Separation of responsibility
Keep each concern in one place.

- Hub page: browsing, auth entry, profile entry, global discovery
- Profile page: identity, history, owned content, account settings
- Game page: gameplay only, with calls into shared APIs
- Shared platform scripts: auth, scores, inventory, purchases, telemetry

This prevents every game from reimplementing login, inventory, and leaderboard UI differently.

## Migration path from the current repo
Recommended order:

1. Move game metadata into one shared JS file.
2. Render `index.html` cards from that metadata.
3. Extract duplicated Firebase score/auth code from the hub into shared platform files.
4. Move each game into a consistent `games/<slug>/index.html` shape.
5. Add inventory and shop only after the shared player data model is stable.

## Practical product recommendation
If you want scores, items, and purchases later, do not build those per game first.
Build them as platform features with per-game configuration.

That means:
- one user account
- one wallet/inventory
- one shared catalog
- one shared score API
- one per-game manifest

That structure will scale much better than treating each HTML game as a separate mini-site.