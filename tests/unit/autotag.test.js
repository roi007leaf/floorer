import { autotag } from "../../scripts/canvas/autotag.js";

const level = { id: "f1", elevation: { bottom: 10, top: 20, base: 10 } };
const basement = { id: "b1", elevation: { bottom: -Infinity, top: 0, base: -20 } };

test("wall gets levels only", () => {
  expect(autotag.tagData("wall", { levels: [] }, level)).toEqual({ levels: ["f1"] });
  expect(autotag.tagData("wall", { levels: ["f1"] }, level)).toBeNull();
  expect(autotag.tagData("wall", { levels: ["f1", "f2"] }, level)).toBeNull();
});

test("tile gets levels and elevation", () => {
  expect(autotag.tagData("tile", { levels: [] }, level)).toEqual({ levels: ["f1"], elevation: 10 });
  expect(autotag.tagData("tile", { levels: ["f1"], elevation: 10 }, level)).toBeNull();
  expect(autotag.tagData("tile", { levels: ["f1"], elevation: 0 }, level)).toEqual({ elevation: 10 });
});

test("elevation comes from the level base, not bottom", () => {
  expect(autotag.tagData("tile", { levels: [] }, basement)).toEqual({ levels: ["b1"], elevation: -20 });
  expect(autotag.tagData("light", { levels: [] }, basement)).toEqual({ elevation: -20 });
});

test("light forced untagged with elevation", () => {
  expect(autotag.tagData("light", { levels: ["f1"], elevation: 10 }, level)).toEqual({ levels: [] });
  expect(autotag.tagData("light", { levels: [], elevation: 10 }, level)).toBeNull();
  expect(autotag.tagData("light", { levels: ["f1", "f2"], elevation: 10 }, level)).toBeNull();
  expect(autotag.tagData("light", { levels: [] }, level)).toEqual({ elevation: 10 });
  expect(autotag.tagData("light", { levels: ["f2"], elevation: 10 }, level)).toEqual({ levels: [] });
});

test("onPreCreate respects predicate, setting, user", () => {
  canvas.level = level;
  canvas.scene = { levels: { get: () => level } };
  game.settings.set("floorer", "autoTag", true);
  const doc = { updateSource: jest.fn() };
  autotag.setEnabledPredicate(() => false);
  autotag.onPreCreate("wall", doc, { levels: [] }, {}, "gm1");
  expect(doc.updateSource).not.toHaveBeenCalled();
  autotag.setEnabledPredicate(() => true);
  autotag.onPreCreate("wall", doc, { levels: [] }, {}, "other");
  expect(doc.updateSource).not.toHaveBeenCalled();
  autotag.onPreCreate("wall", doc, { levels: [] }, {}, "gm1");
  expect(doc.updateSource).toHaveBeenCalledWith({ levels: ["f1"] });
});
