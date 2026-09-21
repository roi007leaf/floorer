# Changelog

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
