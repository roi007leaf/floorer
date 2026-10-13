# Floorer

Guided builder for Foundry VTT v14 multi-level scenes. GM only.

**Demo video:** [docs/floorer-demo.mp4](docs/floorer-demo.mp4) — setup from floor images, traced floors, holes mirrored below, outline walls, stairs, token level change, sight through openings, lint fixes, undo.

## Install

Foundry → Add-on Modules → Install Module → paste this manifest URL:

```
https://raw.githubusercontent.com/roi007leaf/floorer/main/module.json
```

Requires Foundry VTT v14. This URL always points at the newest build, including alphas, so Foundry detects updates.

## Workflow

1. Open a scene and click the **Floorer** button in the Regions control group.
2. **Set up levels**: choose floors above ground, basements, an optional roof, floor height and ground elevation. The band preview updates live; pick one background image per level. If the scene still has only the untouched default level, Floorer adopts it as the ground floor.
3. Click a level's caret or name to view it. In the active row draw its **footprint** (polygon, rectangle or the whole scene). Floorer creates a Define Surface region in the level's band, marks the top inclusive and tags the surface to every level that can see it, so floors never look transparent.
4. **Hole** cuts an opening in the active floor and mirrors it into the ceiling of the level below.
5. **Stair**: pick the target level (defaults to the level above) and draw. Floorer places a Change Level region in the lower band, tags both levels and mirrors the opening into both surfaces.
6. **Walls** builds wall segments along the active floor's outline (outer edge and holes), tagged to that level only; traced floors get them automatically when the setting is on. Re-run after changing the footprint.
7. While the panel is open, **Dim other floors** fades placeables that belong to other levels, and new walls, tiles, sounds and notes are tagged to the active level. Lights get elevation only so light spills through openings.

### Scene states

A scene state is one configuration of the scene, and each stair can lead somewhere different in each state. Open **Scene states** from the panel header to add states, rename them and pick the active one; the header then shows a switcher.

On a stair's row in the level details, the branch button sets that stair's destination per state: **Off**, another **Level** in this scene, or **Another scene** (pick the scene, the level in it and where the token lands). Choosing another scene copies the stair's own shape into that scene as a landing region, so tokens arrive on the matching spot.

The airship case: build the hull once, add states *Upright*, *Rolled to port* and *Docked*. The companionway stair leads to the upper deck while upright, to the opposite deck once rolled, and to the quayside scene while docked. Switching the state retargets every stair and re-cuts the floor openings so sight and light follow the stairwell that is actually in use.

Problems are listed under the level they belong to; **Fix** or **Fix all** repairs them. **Undo** and **Revert** reverse Floorer's changes for the current scene view.

## Settings

- Mirror holes into the level below
- Auto-tag new placeables to the active level
- Seal basements by default
- Build outline walls for traced floors

## Development

```
npm install
npx jest
npx eslint .
```
