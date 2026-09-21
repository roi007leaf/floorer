import { buildFloorPlan, surfaceLevels, orderPair, isManaged, findLevel, finiteOrNull, bandOf, shaftOf, stairStops } from "../../scripts/model/floor-plan.js";

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
  expect(plan.levels[1].arrivingStairs).toEqual([]);
  expect(plan.levels[2].stairs).toEqual([]);
  expect(plan.levels[2].arrivingStairs.map((s) => s.id)).toEqual(["st"]);
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

test("finiteOrNull maps non-finite to null", () => {
  expect(finiteOrNull(5)).toBe(5);
  expect(finiteOrNull(0)).toBe(0);
  expect(finiteOrNull(Infinity)).toBeNull();
  expect(finiteOrNull(-Infinity)).toBeNull();
  expect(finiteOrNull(null)).toBeNull();
  expect(finiteOrNull(undefined)).toBeNull();
});

test("bandOf normalises live and plain levels", () => {
  expect(bandOf({ elevation: { bottom: 20, top: Infinity } })).toEqual({ bottom: 20, top: null });
  expect(bandOf({ elevation: { bottom: -Infinity, top: 0 } })).toEqual({ bottom: null, top: 0 });
  expect(bandOf({ elevation: { bottom: 0, top: 10 } })).toEqual({ bottom: 0, top: 10 });
  expect(bandOf({})).toEqual({ bottom: null, top: null });
});

test("buildFloorPlan tolerates a null scene", () => {
  expect(buildFloorPlan(null)).toEqual({ scene: null, levels: [] });
  expect(buildFloorPlan({})).toEqual({ scene: {}, levels: [] });
});

test("buildFloorPlan lists a shaft as arriving on its stops", () => {
  const scene = { levels: [L("f1", 0, 10), L("f2", 10, 20), L("f3", 20, 30)], regions: [R("st", "stair", "f1", { targetLevelId: "f3", stops: ["f2"] })] };
  const plan = buildFloorPlan(scene);
  expect(plan.levels[0].stairs.map((s) => s.id)).toEqual(["st"]);
  expect(plan.levels[1].arrivingStairs.map((s) => s.id)).toEqual(["st"]);
  expect(plan.levels[2].arrivingStairs.map((s) => s.id)).toEqual(["st"]);
});

test("shaftOf spans lower bottom to upper top and collects the levels inside as stops", () => {
  const b = L("b", -Infinity, 0), f1 = L("f1", 0, 10), f2 = L("f2", 10, 20), r = L("r", 20, Infinity), half = L("h", 15, 25);
  expect(shaftOf(f1, f2, [half, f2, f1, b, r])).toEqual({ band: { bottom: 0, top: 20 }, levels: ["f1", "f2"], stops: [] });
  expect(shaftOf(b, r, [half, f2, f1, b, r])).toEqual({ band: { bottom: null, top: null }, levels: ["b", "f1", "f2", "h", "r"], stops: ["f1", "f2", "h"] });
  expect(shaftOf(f1, f2)).toEqual({ band: { bottom: 0, top: 20 }, levels: ["f1", "f2"], stops: [] });
  expect(stairStops({ flags: { floorer: { stops: ["x"] } } })).toEqual(["x"]);
  expect(stairStops({ flags: {} })).toEqual([]);
});

test("buildFloorPlan picks the surface with more holes and lists extras", () => {
  const many = R("many", "surface", "f1", { holes: [{ id: "h1" }, { id: "h2" }] });
  const few = R("few", "surface", "f1", { holes: [{ id: "h1" }] });
  const scene = { levels: [L("f1", 0, 10)], regions: [few, many] };
  const plan = buildFloorPlan(scene);
  expect(plan.levels[0].surface.id).toBe("many");
  expect(plan.levels[0].extraSurfaces.map((s) => s.id)).toEqual(["few"]);
});

test("buildFloorPlan breaks a hole tie on shape count, then on first", () => {
  const tied1 = R("tied1", "surface", "f1", { holes: [] });
  const tied2 = R("tied2", "surface", "f1", { holes: [] });
  const scene = { levels: [L("f1", 0, 10)], regions: [tied1, tied2] };
  expect(buildFloorPlan(scene).levels[0].surface.id).toBe("tied1");

  const moreShapes = { ...R("moreShapes", "surface", "f1", { holes: [] }), shapes: [{}, {}] };
  const fewerShapes = { ...R("fewerShapes", "surface", "f1", { holes: [] }), shapes: [{}] };
  const scene2 = { levels: [L("f1", 0, 10)], regions: [fewerShapes, moreShapes] };
  expect(buildFloorPlan(scene2).levels[0].surface.id).toBe("moreShapes");
});

test("buildFloorPlan lists arriving stairs even when the owner level is gone", () => {
  const scene = { levels: [L("f2", 10, 20)], regions: [R("st", "stair", "gone", { targetLevelId: "f2" })] };
  const plan = buildFloorPlan(scene);
  expect(plan.levels[0].stairs).toEqual([]);
  expect(plan.levels[0].arrivingStairs.map((s) => s.id)).toEqual(["st"]);
});
