import { toHoleShapes, holeAppendData, mirrorTargets, holeUpdates } from "../../scripts/model/holes.js";

const rect = { type: "rectangle", x: 1, y: 2, width: 3, height: 4, rotation: 0, hole: false };
const S = (id, holes = []) => ({ id, _id: id, shapes: [rect], flags: { floorer: { role: "surface", levelId: id, holes, managed: true } } });
const FL = (id, surface, below = null, above = null) => ({ level: { id }, surface, stairs: [], managed: true, below, above });

test("toHoleShapes forces hole true and clones", () => {
  const out = toHoleShapes([rect]);
  expect(out[0].hole).toBe(true);
  expect(out[0]).not.toBe(rect);
  expect(rect.hole).toBe(false);
});

test("holeAppendData appends shapes and hole flags", () => {
  const s = S("f1", [{ id: "old" }]);
  const upd = holeAppendData(s, [rect], {});
  expect(upd._id).toBe("f1");
  expect(upd.shapes).toHaveLength(2);
  expect(upd.shapes[1].hole).toBe(true);
  expect(upd["flags.floorer.holes"]).toHaveLength(2);
  expect(upd["flags.floorer.holes"][0]).toEqual({ id: "old" });
  expect(upd.ids).toHaveLength(1);
  expect(upd["flags.floorer.holes"][1].id).toBe(upd.ids[0]);
});

test("holeAppendData handles toObject shapes", () => {
  const s = { id: "x", _id: "x", shapes: [{ toObject: () => rect }], flags: { floorer: { holes: [] } } };
  expect(holeAppendData(s, [rect], {}).shapes[0]).toEqual(rect);
});

test("mirrorTargets for hole is level below with managed surface", () => {
  const below = FL("b", S("b"));
  const me = FL("f1", S("f1"), below);
  expect(mirrorTargets(me, "hole")).toEqual([below]);
  expect(mirrorTargets(FL("f1", S("f1"), FL("b", null)), "hole")).toEqual([]);
  const unmanaged = FL("b", { ...S("b"), flags: { floorer: { managed: false } } });
  expect(mirrorTargets(FL("f1", S("f1"), unmanaged), "hole")).toEqual([]);
});

test("mirrorTargets for stair is lower and upper surfaces", () => {
  const above = FL("f2", S("f2"));
  const me = FL("f1", S("f1"), null, above);
  expect(mirrorTargets(me, "stair")).toEqual([me, above]);
});

test("holeUpdates writes own then mirror with mirrorOf", () => {
  const below = FL("b", S("b"));
  const me = FL("f1", S("f1"), below);
  const upd = holeUpdates(me, [rect], "hole");
  expect(upd).toHaveLength(2);
  expect(upd[0]._id).toBe("f1");
  expect(upd[1]._id).toBe("b");
  expect(upd[1]["flags.floorer.holes"][0].mirrorOf).toBe(upd[0].ids[0]);
});

test("holeUpdates empty without own surface", () => {
  expect(holeUpdates(FL("f1", null), [rect], "hole")).toEqual([]);
});

test("holeAppendData merges extra fields into each hole entry", () => {
  const s = S("f1");
  const upd = holeAppendData(s, [rect, rect], { mirrorOf: ["a", "b"], extra: { stairId: "st" } });
  expect(upd["flags.floorer.holes"]).toEqual([
    { id: upd.ids[0], mirrorOf: "a", stairId: "st" },
    { id: upd.ids[1], mirrorOf: "b", stairId: "st" },
  ]);
  expect(holeAppendData(s, [rect], { extra: { stairId: "st" } })["flags.floorer.holes"][0]).toMatchObject({ stairId: "st" });
  expect(holeAppendData(s, [rect], {})["flags.floorer.holes"][0]).toEqual({ id: expect.any(String) });
});
