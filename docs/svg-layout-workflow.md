# SVG Layout Workflow (No Manual x/y Needed)

Goal: Let design drive layout updates with minimal coding friction.

## 1) What You Provide

- One main composition SVG per screen (example: Main-Match-Prep.svg).
- Optional split SVG assets for interactive visuals (buttons/icons), if you want custom hover/press art.
- Layer/group names in Figma that export as stable SVG ids.

You do NOT need to provide manual x/y/w/h values.

## 2) Required Naming Convention

Use clear ids for structural blocks and interactive targets.

Screen root:
- `layout_root`

Structural blocks:
- `block_header`
- `block_left_panel`
- `block_center_panel`
- `block_right_panel`
- `block_bottom_info`
- `block_footer_actions`

Interactive visuals/hotspots:
- `btn_back`
- `btn_ready`
- `btn_start`
- `btn_killing_time`
- `btn_create_room`
- `btn_join_room`
- `btn_copy_invite`
- `btn_leave_room`
- `btn_switch_side`
- `input_room_code`

Decorative:
- `dec_logo`
- `dec_avatar_host`
- `dec_avatar_guest`

## 3) How Copilot Maps It

- Read `viewBox` and named ids from the main SVG.
- Build a fixed-ratio layout canvas in HTML/CSS (same method as title screen).
- Place existing functional DOM controls on top of corresponding ids.
- Keep all game logic and events unchanged in JS.
- Apply shared interaction states (hover/active/disabled/focus) to mapped controls.

## 4) Why This Is Flexible

When design changes:
- You update the SVG (same ids).
- Copilot remaps positions/styles automatically.
- Functionality stays stable because JS ids/classes do not change.

## 5) If IDs Change

If you rename groups/ids in Figma export, include a short mapping note:
- old id -> new id

No coordinate sheet required.

## 6) Best Practice for Export

- Keep artboard fixed (e.g., 1200x700) for each screen.
- Preserve ids/names on groups.
- Avoid flattening all content into anonymous paths when possible.
- Put clickable visual elements in their own named groups.

## 7) Minimal Handoff Checklist

- Main SVG exported.
- Named groups/ids follow convention.
- Optional split button/icon SVGs exported.
- Any renamed ids listed as old->new.

That is enough for robust implementation and future redesign updates.
