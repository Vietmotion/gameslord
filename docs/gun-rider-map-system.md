# Gun Rider Map System

## Goal
Build maps from a consistent authoring system in Figma while keeping gameplay collision stable and predictable.

## Recommended authoring model
Use a single map document in Figma with these rules:

- Frame size: `1200 x 700`
- Grid size: `100 x 100`
- Island units: every island is drawn as a closed filled shape inside that frame
- Roles: each shape is tagged as one of `ground`, `platform`, or `water`
- Style: fill and stroke belong to the same closed shape so visual outline and collision come from the same geometry

## Runtime map format
Each map should become a small data module with metadata plus shape paths.

```js
const map = {
  id: 'map01',
  frame: { width: 1200, height: 700 },
  grid: { cols: 12, rows: 7, cell: 100 },
  waterLevel: 640,
  islands: [
    {
      id: 'main-ground',
      role: 'ground',
      fill: '#9F5426',
      stroke: '#E9B771',
      path: 'M...Z'
    },
    {
      id: 'floating-1',
      role: 'platform',
      fill: '#9F5426',
      stroke: '#E9B771',
      path: 'M...Z'
    }
  ]
};
```

## Engine rules
- Draw each island from the same closed path used for collision.
- Build a top-surface lookup from the closed path for tank landing and slope.
- Use point-in-polygon for body hits so the engine does not invent fake side walls.
- Keep the main ground destructible.
- Allow floating islands to be destructible only if their outline is rebuilt after deformation.

## Best workflow in Figma
1. Keep one locked `1200 x 700` frame template for every map.
2. Snap island control points to the `100 x 100` grid when blocking out the shape.
3. Duplicate the frame for each new map instead of redrawing from scratch.
4. Name each island layer with its gameplay role: `ground-main`, `platform-left-01`, `platform-top-01`.
5. Export or copy each closed vector path into a map data object.
6. Keep water level and spawn zones as explicit numeric metadata, not embedded in the path.

## Best workflow in code
1. Move each map into its own JS file later.
2. Keep a central map registry that lists playable maps.
3. Separate `visual style`, `collision shape`, and `spawn metadata` in the data model.
4. Add a small validation step that checks paths are closed and inside frame bounds.
5. Do not infer gameplay collision from raster images.

## Practical recommendation
For Gun Rider, the best long-term structure is:

- Figma for layout and island shape authoring
- SVG path export for island geometry
- JS map data modules for runtime loading
- Shape-based collision and surface sampling in the game engine

That keeps new maps fast to make, visually accurate, and consistent with projectile and player physics.