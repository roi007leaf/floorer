import { draftFromRow, isIncompleteDraft, VARIANT_KINDS, VARIANT_PLACEMENTS } from "../../scripts/ui/variants-form.js";

test("the kinds and placements match the schema choices", () => {
  expect(VARIANT_KINDS).toEqual(["off", "level", "scene"]);
  expect(VARIANT_PLACEMENTS).toEqual(["center", "relative", "random"]);
});

test("switching to the scene kind with no selection yields an incomplete draft", () => {
  const draft = draftFromRow({ kind: "scene", level: "f2", scene: null, sceneLevel: null, placement: null });
  expect(draft).toEqual({ kind: "scene", sceneId: null, levelId: null, placement: "center" });
  expect(isIncompleteDraft(draft)).toBe(true);
});

test("an explicit scene id yields a complete draft", () => {
  const draft = draftFromRow({ kind: "scene", scene: "quay", sceneLevel: "deck", placement: "random" });
  expect(draft).toEqual({ kind: "scene", sceneId: "quay", levelId: "deck", placement: "random" });
  expect(isIncompleteDraft(draft)).toBe(false);
});

test("empty select values count as absent", () => {
  const draft = draftFromRow({ kind: "scene", scene: "", sceneLevel: "", placement: "" });
  expect(draft).toEqual({ kind: "scene", sceneId: null, levelId: null, placement: "center" });
  expect(isIncompleteDraft(draft)).toBe(true);
});

test("level and off drafts are never incomplete", () => {
  expect(isIncompleteDraft({ kind: "level", levelId: null })).toBe(false);
  expect(isIncompleteDraft({ kind: "off" })).toBe(false);
});

test("the level kind carries the level select and tolerates it being absent", () => {
  expect(draftFromRow({ kind: "level", level: "f3" })).toEqual({ kind: "level", levelId: "f3" });
  expect(draftFromRow({ kind: "level" })).toEqual({ kind: "level", levelId: null });
});

test("anything else is off", () => {
  expect(draftFromRow({ kind: "off", level: "f3" })).toEqual({ kind: "off" });
  expect(draftFromRow({})).toEqual({ kind: "off" });
});
