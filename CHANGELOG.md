# Changelog

## 1.0.0-alpha.4

**Scene states** — one scene, several configurations, and each stair can lead somewhere different in each.

- Define named states for a scene (an airship's *Upright*, *Rolled to port*, *Docked*) from the panel header; the header then shows a switcher.
- Each stair gets a destination per state: another **level** in this scene, a level in **another scene**, or **off**. Picking another scene copies the stair's own shape there as a landing region, so tokens arrive on the matching spot.
- Switching a state retargets every stair, re-tags and re-bands its region, re-cuts the floor openings so sight and light follow the stairwell actually in use, and enables exactly one destination behaviour. Re-applying the same state writes nothing.
- `game.modules.get("floorer").api.setState(scene, "Inverted")` so a macro can drive it mid-sequence.
- New lint: a stair missing a destination for some state, a destination whose scene or region is gone, and a variant with no behaviour behind it.

Known limitation: a combat that crosses scenes fights Foundry's per-scene combat tracker. For an encounter, model each configuration as its own set of levels in one scene and use level destinations rather than scene destinations.

## 1.0.0-alpha.3

- Update checks work again: the manifest URL now points at the manifest on `main` instead of `releases/latest`, which GitHub does not resolve for pre-releases (it returned 404, so Foundry could never see a new version).

**Testers on alpha.1 or alpha.2 must reinstall once** with the URL below; after that, updates show up in Foundry normally.

## 1.0.0-alpha.2

- Re-running Whole map / drawing a footprint replaces the level's surface instead of adding a second one; new surface-duplicate lint with one-click delete.
- Seal / unseal tooltips explain when a cellar must be unsealed (openings upward).
- Draw walls activates the wall drawing tool.
- Removed the experimental interior-wall tracing and door/window tools; outline walls stay.

## 1.0.0-alpha.1

First public alpha for testers. Foundry VTT v14 only.

- Set up levels from floor images (floors, basements, roof, per-level images); adopts the scene's default level as the ground floor.
- Floors: one-click footprint traced from image transparency, or draw polygon / rectangle / ellipse; whole-map fallback.
- Holes mirrored into the ceiling below; stairs span the full climb with intermediate stops, openings cut in every connected floor, color-coded and linked across levels.
- Editable elevation bands per level with cascade; seal / unseal levels; rename; remove leftover levels.
- Outline walls built from the traced footprint; Draw walls pre-tagged to the level.
- Lint of floorer's own invariants with one-click fixes; session journal with Undo / Revert.
- Other floors dimmed and unclickable while the panel is open; auto-tagging of new placeables (lights left untagged so light spills through openings).
- Entry points: Scene Config → Levels tab, and the Regions toolbar.
