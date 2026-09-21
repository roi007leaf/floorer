import { levelRemovalPlan } from "../../scripts/model/level-remove.js";
import { buildFloorPlan } from "../../scripts/model/floor-plan.js";

const L = (id, bottom, top, managed = true) => ({
  id, _id: id, elevation: { bottom, top }, visibility: { levels: new Set([id]) },
  flags: { floorer: { role: "level", managed } },
});
const T = (id, level, elevation) => ({ id, _id: id, level, elevation });

test("levelRemovalPlan returns null when it is the only level", () => {
  const plan = buildFloorPlan({ levels: [L("f1", 0, 10)], regions: [], tokens: [] });
  expect(levelRemovalPlan(plan, "f1")).toBeNull();
});

test("levelRemovalPlan returns null when no other managed level exists", () => {
  const plan = buildFloorPlan({ levels: [L("f1", 0, 10), L("u", 10, 20, false)], regions: [], tokens: [] });
  expect(levelRemovalPlan(plan, "f1")).toBeNull();
});

test("levelRemovalPlan moves tokens into the containing managed level, keeping elevation", () => {
  const plan = buildFloorPlan({
    levels: [L("b", -10, 0), L("f1", 0, 10), L("f2", 10, 20)],
    regions: [],
    tokens: [T("t1", "f1", 15), T("t2", "f1", -5)],
  });
  const result = levelRemovalPlan(plan, "f1");
  expect(result.tokens).toEqual([
    { _id: "t1", level: "f2", elevation: 15 },
    { _id: "t2", level: "b", elevation: -5 },
  ]);
});

test("levelRemovalPlan moves tokens to the nearest managed level when none contains the elevation", () => {
  const plan = buildFloorPlan({
    levels: [L("b", -10, 0), L("f1", 0, 10), L("f2", 20, 30)],
    regions: [],
    tokens: [T("t1", "f1", 15), T("t2", "f1", -15)],
  });
  const result = levelRemovalPlan(plan, "f1");
  expect(result.tokens).toEqual([
    { _id: "t1", level: "f2", elevation: 15 },
    { _id: "t2", level: "b", elevation: -15 },
  ]);
});

test("levelRemovalPlan skips unmanaged levels as targets", () => {
  const plan = buildFloorPlan({
    levels: [L("b", -10, 0), L("f1", 0, 10), L("u", 10, 20, false)],
    regions: [],
    tokens: [T("t1", "f1", 15)],
  });
  const result = levelRemovalPlan(plan, "f1");
  expect(result.tokens).toEqual([{ _id: "t1", level: "b", elevation: 15 }]);
});

test("levelRemovalPlan fallbackId is the managed level for elevation 0", () => {
  const plan = buildFloorPlan({
    levels: [L("b", -10, 0), L("f1", 0, 10), L("f2", 10, 20)],
    regions: [],
    tokens: [],
  });
  expect(levelRemovalPlan(plan, "f1").fallbackId).toBe("b");
});

test("levelRemovalPlan defaults missing token elevation to 0", () => {
  const plan = buildFloorPlan({
    levels: [L("b", -10, 0), L("f1", 0, 10)],
    regions: [],
    tokens: [{ id: "t1", _id: "t1", level: "f1" }],
  });
  const result = levelRemovalPlan(plan, "f1");
  expect(result.tokens).toEqual([{ _id: "t1", level: "b", elevation: undefined }]);
});
