import { surfaceCreateData, stairCreateData, wholeSceneShape, movementActionKeys, surfaceBehavior } from "../../scripts/model/regions.js";

const L = (id, bottom, top, vis) => ({ id, name: id, elevation: { bottom, top }, visibility: { levels: new Set(vis) } });
const shapes = [{ type: "rectangle", x: 0, y: 0, width: 10, height: 10, rotation: 0, hole: false }];

test("surfaceCreateData tags every viewing level", () => {
  const f1 = L("f1", 0, 10, ["f1", "f2"]);
  const f2 = L("f2", 10, 20, ["f1", "f2"]);
  const data = surfaceCreateData(f1, [f1, f2], shapes);
  expect(data.levels.sort()).toEqual(["f1", "f2"]);
  expect(data.elevation).toEqual({ bottom: 0, top: 10 });
  expect(data.topInclusive).toBe(true);
  expect(data.behaviors[0]).toEqual({ type: "defineSurface", system: { placement: "both", light: true, move: true, sight: true, sound: true, occlusion: true, exposure: false, culling: false } });
  expect(data.flags.floorer).toEqual({ role: "surface", levelId: "f1", holes: [], managed: true, v: 1 });
  expect(data.name).toBe("Surface f1");
  expect(data.shapes).toBe(shapes);
});

test("roof surface uses bottom placement", () => {
  expect(surfaceBehavior(L("r", 20, null, ["r"])).system.placement).toBe("bottom");
});

test("stairCreateData sits in lower band regardless of argument order", () => {
  const f1 = L("f1", 0, 10, ["f1"]);
  const f2 = L("f2", 10, 20, ["f2"]);
  const data = stairCreateData(f2, f1, shapes, ["walk", "displace"]);
  expect(data.elevation).toEqual({ bottom: 0, top: 10 });
  expect(data.topInclusive).toBe(true);
  expect(data.levels).toEqual(["f1", "f2"]);
  expect(data.behaviors[0]).toEqual({ type: "changeLevel", system: { movementActions: ["walk"] } });
  expect(data.flags.floorer).toEqual({ role: "stair", levelId: "f1", targetLevelId: "f2", managed: true, v: 1 });
  expect(data.name).toBe("Stair f1 ↔ f2");
});

test("movementActionKeys excludes displace", () => {
  expect(movementActionKeys()).not.toContain("displace");
  expect(movementActionKeys()).toContain("walk");
});

test("wholeSceneShape", () => {
  expect(wholeSceneShape({ x: 5, y: 6, width: 100, height: 50 })).toEqual({ type: "rectangle", x: 5, y: 6, width: 100, height: 50, rotation: 0, hole: false });
});
