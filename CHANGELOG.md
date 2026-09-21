# Changelog

## 1.0.0-alpha.2

- Re-running Whole map / drawing a footprint replaces the level's surface instead of adding a second one; new  lint with one-click delete.
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
