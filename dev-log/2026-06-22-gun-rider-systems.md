# Dev Log - 2026-06-22

## Session summary
Today focused on Gun Rider systems work, especially multiplayer groundwork, map behavior, and audio consistency.

## Completed in this session

### Multiplayer prototype (Gun Rider)
- Added online room flow prototype in Gun Rider:
  - Create room
  - Join room by code
  - Copy invite code
  - Leave room
- Added room status and role hints in the start screen UI.
- Added Firebase-backed room listener/action sync path for turn shots.
- Kept single-player behavior as fallback when no room is active.

### Map behavior and island collision/rendering
- Diagnosed flying island artifacts caused by band/column-based platform geometry.
- Reworked floating island logic to use closed shape bodies for collision and rendering alignment.
- Removed fake side-wall collision behavior introduced by previous sampling approach.
- Improved platform rendering path usage to keep island outlines closer to authored shape.
- Added map-system design note for future authoring and runtime structure.

### Sound effects pass
- Updated charging SFX to `charging02.mp3`.
- Fixed charge audio timing consistency so it starts reliably on space press.
- Fixed regression where reaching 100% charge prevented firing on key release.
- Added one-shot SFX routing:
  - Fire: `shot01.mp3`
  - Vehicle hit: `impact01.mp3`
  - Ground/platform hit: `impact-ground01.mp3`
- Added simple cue-start support for later fine tuning of each SFX clip.

## Product notes (for future)
- Game can be developed much further with stronger systems and polish.
- Major feature opportunities:
  - Better start screen flow
  - Vehicle select
  - Different projectile types
  - More maps
  - Items/utility systems
  - Richer VFX and gameplay effects
  - Multiplayer mode expansion
  - Better SFX pass and background music design

## Technical direction for later
This game now needs a cleaner structure to scale safely.

Recommended direction:
1. Split gameplay, rendering, audio, and map logic into separate JS modules/files.
2. Move map definitions out of inline HTML script into map data files.
3. Add map metadata schema (spawns, wind profile, water, platform behavior).
4. Formalize multiplayer networking model (room state + turn event protocol + reconnect handling).
5. Add a dedicated audio manager (channels, ducking, cooldowns, cue offsets, music layers).
6. Add a feature roadmap with milestones so experiments become production-ready systems.

## Follow-up next session
1. Playtest current map collision/rendering and verify no remaining flying island edge artifacts.
2. Tune SFX cue offsets with ear test to lock impact timing.
3. Decide whether to commit multiplayer prototype as-is or harden with rules/reconnect before merge.
4. Start extracting Gun Rider into a maintainable multi-file architecture.
