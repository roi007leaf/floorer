import { buildFloorPlan, surfaceLevels, orderPair, isManaged, findLevel } from "../../scripts/model/floor-plan.js";

const L = (id, bottom, top, vis = [id], flags = { floorer: { role: "level", managed: true } }) => ({
  id, _id: id, elevation: { bottom, top }, visibility: { levels: new Set(vis) }, flags,
});
const R = (id, role, levelId, extra = {}) => ({
  id, _id: id, flags: { floorer: { role, levelId, managed: true, ...extra } },
});

test("buildFloorPlan sorts and groups", () => {
  const scene = {
    levels: [L("f2", 10, 20), L("b", -10, 0), L("f1", 0, 10)],
    regions: [R("s1", "surface", "f1"), R("st", "stair", "f1", { targetLevelId: "f2" }), R("s2", "surface", "f2"), { id: "x", flags: {} }],
  };
  const plan = buildFloorPlan(scene);
  expect(plan.levels.map((l) => l.level.id)).toEqual(["b", "f1", "f2"]);
  expect(plan.levels[1].surface.id).toBe("s1");
  expect(plan.levels[1].stairs.map((s) => s.id)).toEqual(["st"]);
  expect(plan.levels[0].surface).toBeNull();
  expect(plan.levels[1].below.level.id).toBe("b");
  expect(plan.levels[1].above.level.id).toBe("f2");
  expect(plan.levels[2].above).toBeNull();
});

test("unmanaged level still listed", () => {
  const scene = { levels: [L("u", 0, 10, ["u"], {})], regions: [] };
  const plan = buildFloorPlan(scene);
  expect(plan.levels[0].managed).toBe(false);
});

test("isManaged false when flag managed=false", () => {
  expect(isManaged({ flags: { floorer: { managed: false } } })).toBe(false);
  expect(isManaged({ flags: { floorer: { managed: true } } })).toBe(true);
  expect(isManaged({ flags: {} })).toBe(false);
});

test("surfaceLevels includes own and viewers", () => {
  const f1 = L("f1", 0, 10, ["f1", "f2"]);
  const f2 = L("f2", 10, 20, ["f1", "f2"]);
  const b = L("b", -10, 0, ["b"]);
  expect(surfaceLevels(f1, [b, f1, f2]).sort()).toEqual(["f1", "f2"]);
  expect(surfaceLevels(b, [b, f1, f2])).toEqual(["b"]);
});

test("surfaceLevels handles array visibility", () => {
  const f1 = { id: "f1", visibility: { levels: ["f1"] } };
  const f2 = { id: "f2", visibility: { levels: ["f1", "f2"] } };
  expect(surfaceLevels(f1, [f1, f2]).sort()).toEqual(["f1", "f2"]);
});

test("orderPair", () => {
  const a = L("a", 10, 20), b = L("b", 0, 10);
  expect(orderPair(a, b)).toEqual({ lower: b, upper: a });
});

test("findLevel", () => {
  const plan = buildFloorPlan({ levels: [L("f1", 0, 10)], regions: [] });
  expect(findLevel(plan, "f1").level.id).toBe("f1");
  expect(findLevel(plan, "nope")).toBeUndefined();
});
