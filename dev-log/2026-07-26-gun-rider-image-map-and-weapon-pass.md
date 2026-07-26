# Dev Log - 2026-07-26

## Session summary
This session focused on a major Gun Rider gameplay and presentation pass across three connected areas:
1. Image-map integration and terrain/render sync
2. Multi-weapon support and CatRket projectile behaviors
3. HUD and projectile polish for readability and control clarity

## Completed in this session

### Image-map integration and terrain sync
- Switched Gun Rider to the new `banhkeo-image` map mode while keeping the legacy map pipeline available as fallback.
- Added image layer loading for:
  - far background
  - main island
  - flying islands
  - cloud/water layer
- Built terrain collision from the main-island alpha mask.
- Built flying-island collision/platform bodies from the two island layer masks.
- Preserved existing gameplay logic for:
  - player standing and falling
  - projectile impact checks
  - water death behavior
  - camera and turn flow

### Crater and cut rendering polish
- Restored visible crater cuts on the main island so image-map terrain visuals match collision deformation.
- Updated flying islands to render through their live platform geometry so holes and splits are visible there too.
- Added thin cut-edge outlines that auto-sample nearby terrain/island color and darken it slightly for readability.
- Lowered and visually hid the flat water band under the main island so cloud cover handles the visual separation.

### Weapon system implementation
- Added per-weapon mode support for CatRket:
  - primary shot
  - W secondary sticky shot
  - E ultimate shot
- Added projectile SVG loading for weapon-specific visuals.
- Added W sticky behavior:
  - sticks on impact
  - flashes before detonation
  - remains armed until manually toggled off
  - uses smaller terrain damage than the primary shot
- Added E ultimate behavior with larger projectile scale and stronger terrain damage.

### Projectile and HUD polish
- Updated projectile rendering to preserve SVG aspect ratio instead of squashing into squares.
- Added trajectory-aligned projectile rotation.
- Iterated projectile facing behavior to match left-side/right-side firing rules.
- Added HUD weapon slot icons for W and E.
- Fixed W slot rendering to use the actual small slot as its layout frame and center the SVG inside it.
- Centered W-related armed text/labeling off the same slot geometry.

### Sticky-mine detonation fix
- Fixed a critical W-platform bug where hitting the bottom of a flying island could also carve the main island below.
- Sticky mines attached to flying islands now only deform the platform they are attached to.

## Files and assets touched (high-level)
- `04 - Gun Rider/assets/js/gunrider.js`
- `04 - Gun Rider/gunrider.html`
- `04 - Gun Rider/assets/css/gunrider.css`
- `04 - Gun Rider/map/map1-banhkeo/*`
- `04 - Gun Rider/svg/char-catrket/*`

## Deployment note
- GitHub Pages is configured to publish the repository root on push to `main` via `.github/workflows/deploy-pages.yml`.
- If the website does not reflect the latest Gun Rider changes, the current workspace edits still need to be committed and pushed.
- This matters especially for the newly added/updated image assets under the Gun Rider map and character SVG folders.

## Follow-up next session
1. Do one controlled gameplay pass on projectile facing for all three CatRket shots after live browser verification.
2. Confirm the W sticky-mine bottom-hit behavior on both flying islands under repeated impacts.
3. Review whether any hub/index thumbnails or links should be updated for the latest Gun Rider map presentation.