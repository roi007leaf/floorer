import { draftFromRow, VARIANT_KINDS, VARIANT_PLACEMENTS } from "../../scripts/ui/variants-form.js";

const context = { currentSceneId: "here", firstOtherSceneId: "there" };

test("the kinds and placements match the schema choices", () => {
  expect(VARIANT_KINDS).toEqual(["off", "level", "scene"]);
  expect(VARIANT_PLACEMENTS).toEqual(["center", "relative", "random"]);
});

test("switching to the scene kind with no sub-selects yet falls back to a usable draft", () => {
  const draft = draftFromRow({ kind: "scene", level: "f2", scene: null, sceneLevel: null, placement: null }, context);
  expect(draft).toEqual({ kind: "scene", sceneId: "there", levelId: null, placement: "center" });
});

test("explicit sub-select values win over the fallbacks", () => {
  const draft = draftFromRow({ kind: "scene", scene: "quay", sceneLevel: "deck", placement: "random" }, context);
  expect(draft).toEqual({ kind: "scene", sceneId: "quay", levelId: "deck", placement: "random" });
});

test("with no other scene the current scene is the fallback", () => {
  expect(draftFromRow({ kind: "scene" }, { currentSceneId: "here", firstOtherSceneId: null }).sceneId).toBe("here");
  expect(draftFromRow({ kind: "scene" }, {}).sceneId).toBeNull();
});

test("empty select values count as absent", () => {
  const draft = draftFromRow({ kind: "scene", scene: "", sceneLevel: "", placement: "" }, context);
  expect(draft).toEqual({ kind: "scene", sceneId: "there", levelId: null, placement: "center" });
});

test("the level kind carries the level select and tolerates it being absent", () => {
  expect(draftFromRow({ kind: "level", level: "f3" }, context)).toEqual({ kind: "level", levelId: "f3" });
  expect(draftFromRow({ kind: "level" }, context)).toEqual({ kind: "level", levelId: null });
});

test("anything else is off", () => {
  expect(draftFromRow({ kind: "off", level: "f3" }, context)).toEqual({ kind: "off" });
  expect(draftFromRow({}, context)).toEqual({ kind: "off" });
});
