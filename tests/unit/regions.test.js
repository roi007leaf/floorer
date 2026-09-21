import { surfaceCreateData, stairCreateData, wholeSceneShape, movementActionKeys, surfaceBehavior, STAIR_PALETTE, stairColor, stairIndexUpdates } from "../../scripts/model/regions.js";

const L = (id, bottom, top, vis) => ({ id, name: id, elevation: { bottom, top }, visibility: { levels: new Set(vis) } });
const shapes = [{ type: "rectangle", x: 0, y: 0, width: 10, height: 10, rotation: 0, hole: false }];

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
  expect(stairCreateData(b, f1, shapes, ["walk"]).elevation).toEqual({ bottom: null, top: 0, topInclusive: true });
});

test("stairCreateData sits in lower band regardless of argument order", () => {
  const f1 = L("f1", 0, 10, ["f1"]);
  const f2 = L("f2", 10, 20, ["f2"]);
  const data = stairCreateData(f2, f1, shapes, ["walk", "displace"]);
  expect(data.elevation).toEqual({ bottom: 0, top: 10, topInclusive: true });
  expect(data.topInclusive).toBeUndefined();
  expect(data.levels).toEqual(["f1", "f2"]);
  expect(data.behaviors[0]).toEqual({ type: "changeLevel", system: { movementActions: ["walk"] } });
  expect(data.flags.floorer).toEqual({ role: "stair", levelId: "f1", targetLevelId: "f2", index: 0, managed: true, v: 1 });
  expect(data.name).toBe("Stair f1 ↔ f2");
  expect(data.color).toBe(STAIR_PALETTE[0]);
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
