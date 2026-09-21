import { toHoleShapes, holeAppendData, mirrorTargets, holeUpdates, removeHolesData, stairRemovalUpdates, holeRemovalUpdates } from "../../scripts/model/holes.js";

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

const hole = (x) => ({ type: "rectangle", x, y: 0, width: 1, height: 1, rotation: 0, hole: true });
const surfaceWith = (id, holes, holeShapes) => ({ id, _id: id, shapes: [rect, ...holeShapes], flags: { floorer: { role: "surface", levelId: id, holes, managed: true } } });

test("removeHolesData drops matching entries and their shapes, keeping alignment", () => {
  const s = surfaceWith("f1", [{ id: "a" }, { id: "b", stairId: "st" }, { id: "c" }], [hole(1), hole(2), hole(3)]);
  const upd = removeHolesData(s, (h) => h.id === "b");
  expect(upd._id).toBe("f1");
  expect(upd["flags.floorer.holes"]).toEqual([{ id: "a" }, { id: "c" }]);
  expect(upd.shapes).toEqual([rect, hole(1), hole(3)]);
  expect(upd.removed).toEqual(["b"]);
});

test("removeHolesData returns null when nothing matches", () => {
  const s = surfaceWith("f1", [{ id: "a" }], [hole(1)]);
  expect(removeHolesData(s, () => false)).toBeNull();
});

test("stairRemovalUpdates removes openings and their mirrors on every surface", () => {
  const upper = surfaceWith("f2", [{ id: "u1", stairId: "st" }, { id: "u2" }], [hole(1), hole(2)]);
  const lower = surfaceWith("f1", [{ id: "l1", mirrorOf: "u1", stairId: "st" }, { id: "l2", mirrorOf: "u2" }], [hole(1), hole(2)]);
  const plan = { levels: [FL("f1", lower), FL("f2", upper)] };
  const out = stairRemovalUpdates(plan, "st");
  expect(out.map((u) => u._id)).toEqual(["f1", "f2"]);
  expect(out[0]["flags.floorer.holes"]).toEqual([{ id: "l2", mirrorOf: "u2" }]);
  expect(out[1]["flags.floorer.holes"]).toEqual([{ id: "u2" }]);
});

test("holeRemovalUpdates removes the hole and its mirror below", () => {
  const upper = surfaceWith("f2", [{ id: "u1" }, { id: "u2" }], [hole(1), hole(2)]);
  const lower = surfaceWith("f1", [{ id: "l1", mirrorOf: "u1" }], [hole(1)]);
  const plan = { levels: [FL("f1", lower), FL("f2", upper)] };
  const out = holeRemovalUpdates(plan, "u1");
  expect(out.map((u) => u._id)).toEqual(["f1", "f2"]);
  expect(out[0]["flags.floorer.holes"]).toEqual([]);
  expect(out[0].shapes).toEqual([rect]);
  expect(out[1]["flags.floorer.holes"]).toEqual([{ id: "u2" }]);
  expect(holeRemovalUpdates(plan, "zz")).toEqual([]);
});

const polygon = { type: "polygon", points: [0, 0, 10, 0, 10, 10, 0, 10], hole: false };
const ellipse = { type: "ellipse", x: 5, y: 5, radiusX: 3, radiusY: 2, rotation: 0, hole: false };

test("holeAppendData keeps polygon and ellipse geometry, only flipping hole", () => {
  const upd = holeAppendData(S("f1"), [polygon, ellipse], {});
  expect(upd.shapes[1]).toEqual({ ...polygon, hole: true });
  expect(upd.shapes[2]).toEqual({ ...ellipse, hole: true });
  expect(polygon.hole).toBe(false);
});

test("holeUpdates mirrors a polygon into the level below unchanged", () => {
  const below = FL("b", S("b"));
  const upd = holeUpdates(FL("f1", S("f1"), below), [polygon], "hole");
  expect(upd[0].shapes[1]).toEqual({ ...polygon, hole: true });
  expect(upd[1].shapes[1]).toEqual({ ...polygon, hole: true });
  expect(upd[1]["flags.floorer.holes"][0].mirrorOf).toBe(upd[0].ids[0]);
});
