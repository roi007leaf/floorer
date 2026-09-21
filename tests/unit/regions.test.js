import { surfaceCreateData, stairCreateData, wholeSceneShape, movementActionKeys, surfaceBehavior, STAIR_PALETTE, stairColor, stairIndexUpdates } from "../../scripts/model/regions.js";

const L = (id, bottom, top, vis) => ({ id, name: id, elevation: { bottom, top }, visibility: { levels: new Set(vis) } });
const shapes = [{ type: "rectangle", x: 0, y: 0, width: 10, height: 10, rotation: 0, hole: false }];
const floored = (level) => ({ level, surface: { shapes, flags: { floorer: { managed: true } } } });
const bare = (level) => ({ level, surface: null });
const planOf = (entries) => ({ levels: entries });

test("surfaceCreateData tags every viewing level", () => {
  const f1 = L("f1", 0, 10, ["f1", "f2"]);
  const f2 = L("f2", 10, 20, ["f1", "f2"]);
  const data = surfaceCreateData(f1, [f1, f2], shapes);
  expect(data.levels.sort()).toEqual(["f1", "f2"]);
  expect(data.elevation).toEqual({ bottom: 0, top: 10, topInclusive: true });
  expect(data.topInclusive).toBeUndefined();
  expect(data.behaviors[0]).toEqual({ type: "defineSurface", system: { placement: "both", light: true, move: true, sight: true, sound: true, occlusion: true, exposure: false, culling: false } });
  expect(data.flags.floorer).toEqual({ role: "surface", levelId: "f1", holes: [], managed: true, v: 1 });
  expect(data.name).toBe("Surface f1");
  expect(data.shapes).toBe(shapes);
});

test("surfaceCreateData registers a hole entry for every hole:true shape, in shape order", () => {
  const f1 = L("f1", 0, 10, ["f1"]);
  const holeA = { type: "rectangle", x: 1, y: 1, width: 2, height: 2, rotation: 0, hole: true };
  const holeB = { type: "ellipse", x: 5, y: 5, radiusX: 1, radiusY: 1, rotation: 0, hole: true };
  const tracedShapes = [shapes[0], holeA, holeB];
  const data = surfaceCreateData(f1, [f1], tracedShapes);
  expect(data.flags.floorer.holes).toHaveLength(2);
  expect(data.flags.floorer.holes[0]).toEqual({ id: expect.any(String) });
  expect(data.flags.floorer.holes[1]).toEqual({ id: expect.any(String) });
  expect(data.flags.floorer.holes[0].id).not.toBe(data.flags.floorer.holes[1].id);
});

test("roof surface uses bottom placement", () => {
  expect(surfaceBehavior(L("r", 20, null, ["r"])).system.placement).toBe("bottom");
  expect(surfaceBehavior(L("r", 20, Infinity, ["r"])).system.placement).toBe("bottom");
  expect(surfaceBehavior(L("f", 0, 10, ["f"])).system.placement).toBe("both");
});

test("live roof level with Infinity top yields null top in create data", () => {
  const r = L("r", 20, Infinity, ["r"]);
  const data = surfaceCreateData(r, [r], shapes);
  expect(data.elevation).toEqual({ bottom: 20, top: null, topInclusive: true });
  expect(data.behaviors[0].system.placement).toBe("bottom");
});

test("stair from a live basement with -Infinity bottom yields null bottom", () => {
  const b = L("b", -Infinity, 0, ["b"]);
  const f1 = L("f1", 0, 10, ["f1"]);
  expect(stairCreateData(b, f1, shapes, ["walk"]).elevation).toEqual({ bottom: null, top: 10, topInclusive: true });
});

test("stairCreateData spans lower bottom to upper top regardless of argument order", () => {
  const f1 = L("f1", 0, 10, ["f1"]);
  const f2 = L("f2", 10, 20, ["f2"]);
  const data = stairCreateData(f2, f1, shapes, ["walk", "displace"]);
  expect(data.elevation).toEqual({ bottom: 0, top: 20, topInclusive: true });
  expect(data.topInclusive).toBeUndefined();
  expect(data.levels).toEqual(["f1", "f2"]);
  expect(data.behaviors[0]).toEqual({ type: "changeLevel", system: { movementActions: ["walk"] } });
  expect(data.flags.floorer).toEqual({ role: "stair", levelId: "f1", targetLevelId: "f2", stops: [], index: 0, managed: true, v: 1 });
  expect(data.name).toBe("Stair f1 ↔ f2");
  expect(data.color).toBe(STAIR_PALETTE[0]);
});

test("stairCreateData tags every level inside the climb as a stop, sorted by bottom", () => {
  const f1 = L("f1", 0, 10, ["f1"]);
  const f2 = L("f2", 10, 20, ["f2"]);
  const f3 = L("f3", 20, 30, ["f3"]);
  const roof = L("r", 30, null, ["r"]);
  const plan = planOf([bare(roof), bare(f3), floored(f2), bare(f1)]);
  const data = stairCreateData(f3, f1, shapes, ["walk"], 0, plan);
  expect(data.elevation).toEqual({ bottom: 0, top: 30, topInclusive: true });
  expect(data.levels).toEqual(["f1", "f2", "f3"]);
  expect(data.flags.floorer).toMatchObject({ levelId: "f1", targetLevelId: "f3", stops: ["f2"] });
  expect(data.name).toBe("Stair f1 ↔ f3");
});

test("stairCreateData to an open-topped roof includes every level above the lower end", () => {
  const f1 = L("f1", 0, 10, ["f1"]);
  const f2 = L("f2", 10, 20, ["f2"]);
  const roof = L("r", 20, null, ["r"]);
  const plan = planOf([bare(f1), floored(f2), bare(roof)]);
  const data = stairCreateData(f1, roof, shapes, ["walk"], 0, plan);
  expect(data.elevation).toEqual({ bottom: 0, top: null, topInclusive: true });
  expect(data.levels).toEqual(["f1", "f2", "r"]);
  expect(data.flags.floorer.stops).toEqual(["f2"]);
});

test("stairCreateData leaves out levels that only partly overlap the climb", () => {
  const f1 = L("f1", 0, 10, ["f1"]);
  const f2 = L("f2", 10, 20, ["f2"]);
  const half = L("h", 15, 25, ["h"]);
  const plan = planOf([bare(f1), bare(f2), floored(half)]);
  const data = stairCreateData(f1, f2, shapes, ["walk"], 0, plan);
  expect(data.levels).toEqual(["f1", "f2"]);
  expect(data.flags.floorer.stops).toEqual([]);
});

test("stairCreateData excludes an intermediate level whose floor doesn't reach the stair", () => {
  const f1 = L("f1", 0, 10, ["f1"]);
  const f2 = L("f2", 10, 20, ["f2"]);
  const f3 = L("f3", 20, 30, ["f3"]);
  const farShapes = [{ type: "rectangle", x: 1000, y: 1000, width: 10, height: 10, rotation: 0, hole: false }];
  const plan = planOf([bare(f1), { level: f2, surface: { shapes: farShapes, flags: { floorer: { managed: true } } } }, bare(f3)]);
  const data = stairCreateData(f1, f3, shapes, ["walk"], 0, plan);
  expect(data.levels).toEqual(["f1", "f3"]);
  expect(data.flags.floorer.stops).toEqual([]);
});

test("stairCreateData excludes an unmanaged surface even if it covers the stair", () => {
  const f1 = L("f1", 0, 10, ["f1"]);
  const f2 = L("f2", 10, 20, ["f2"]);
  const f3 = L("f3", 20, 30, ["f3"]);
  const plan = planOf([bare(f1), { level: f2, surface: { shapes, flags: { floorer: { managed: false } } } }, bare(f3)]);
  const data = stairCreateData(f1, f3, shapes, ["walk"], 0, plan);
  expect(data.flags.floorer.stops).toEqual([]);
});

test("stairCreateData colors and indexes by creation order", () => {
  const f1 = L("f1", 0, 10, ["f1"]);
  const f2 = L("f2", 10, 20, ["f2"]);
  const data = stairCreateData(f1, f2, shapes, ["walk"], 13);
  expect(data.flags.floorer.index).toBe(13);
  expect(data.color).toBe(STAIR_PALETTE[1]);
});

test("stair palette has 12 distinct colors and wraps", () => {
  expect(STAIR_PALETTE).toHaveLength(12);
  expect(new Set(STAIR_PALETTE).size).toBe(12);
  expect(STAIR_PALETTE.every((c) => /^#[0-9a-f]{6}$/.test(c))).toBe(true);
  expect(stairColor(0)).toBe(STAIR_PALETTE[0]);
  expect(stairColor(12)).toBe(STAIR_PALETTE[0]);
  expect(stairColor(5)).toBe(STAIR_PALETTE[5]);
});

test("stairIndexUpdates assigns sequential indices only when a managed stair lacks one", () => {
  const stair = (id, extra = {}) => ({ id, flags: { floorer: { role: "stair", managed: true, ...extra } } });
  const regions = [stair("a"), { id: "s", flags: { floorer: { role: "surface", managed: true } } }, stair("b", { index: 4 }), { id: "x", flags: { floorer: { role: "stair" } } }, stair("c")];
  expect(stairIndexUpdates(regions)).toEqual([
    { _id: "a", color: STAIR_PALETTE[0], "flags.floorer.index": 0 },
    { _id: "b", color: STAIR_PALETTE[1], "flags.floorer.index": 1 },
    { _id: "c", color: STAIR_PALETTE[2], "flags.floorer.index": 2 },
  ]);
  expect(stairIndexUpdates([stair("a", { index: 0 }), stair("b", { index: 1 })])).toEqual([]);
  expect(stairIndexUpdates(new Set([]))).toEqual([]);
});

test("movementActionKeys excludes displace", () => {
  expect(movementActionKeys()).not.toContain("displace");
  expect(movementActionKeys()).toContain("walk");
});

test("wholeSceneShape", () => {
  expect(wholeSceneShape({ x: 5, y: 6, width: 100, height: 50 })).toEqual({ type: "rectangle", x: 5, y: 6, width: 100, height: 50, rotation: 0, hole: false });
});
