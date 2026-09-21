import { isSealed, sealUpdates } from "../../scripts/model/visibility.js";
import { buildFloorPlan } from "../../scripts/model/floor-plan.js";

const L = (id, bottom, top, vis) => ({ id, _id: id, name: id, elevation: { bottom, top }, visibility: { levels: new Set(vis) }, flags: { floorer: { role: "level", managed: true } } });
const S = (id, levelId, levels, managed = true) => ({ id, _id: id, levels: new Set(levels), flags: { floorer: { role: "surface", levelId, managed } } });
const sorted = (a) => [...a].sort();

test("isSealed accepts Set or array visibility equal to the level itself", () => {
  expect(isSealed({ id: "b", visibility: { levels: new Set(["b"]) } })).toBe(true);
  expect(isSealed({ id: "b", visibility: { levels: ["b"] } })).toBe(true);
  expect(isSealed({ id: "b", visibility: { levels: ["b", "f1"] } })).toBe(false);
  expect(isSealed({ id: "b", visibility: { levels: [] } })).toBe(false);
  expect(isSealed({ id: "b" })).toBe(false);
});

test("sealUpdates seals a level and removes it from every other level", () => {
  const plan = buildFloorPlan({ levels: [L("b", -10, 0, ["b", "f1", "f2"]), L("f1", 0, 10, ["b", "f1", "f2"]), L("f2", 10, 20, ["f1", "f2"])], regions: [
    S("sb", "b", ["b", "f1"]),
    S("s1", "f1", ["b", "f1", "f2"]),
    S("s2", "f2", ["f1", "f2"]),
  ] });
  const out = sealUpdates(plan, "b", true);
  expect(out.levels).toEqual([
    { _id: "b", "visibility.levels": ["b"] },
    { _id: "f1", "visibility.levels": ["f1", "f2"] },
  ]);
  expect(out.before.levels).toEqual([
    { _id: "b", "visibility.levels": ["b", "f1", "f2"] },
    { _id: "f1", "visibility.levels": ["b", "f1", "f2"] },
  ]);
  expect(out.regions.map((r) => [r._id, sorted(r.levels)])).toEqual([
    ["sb", ["b"]],
    ["s1", ["f1", "f2"]],
  ]);
  expect(out.before.regions.map((r) => [r._id, sorted(r.levels)])).toEqual([
    ["sb", ["b", "f1"]],
    ["s1", ["b", "f1", "f2"]],
  ]);
});

test("sealUpdates unseals a level into every unsealed level and leaves sealed ones alone", () => {
  const plan = buildFloorPlan({ levels: [L("b", -10, 0, ["b"]), L("f1", 0, 10, ["f1", "f2"]), L("f2", 10, 20, ["f1", "f2"]), L("x", 20, 30, ["x"])], regions: [
    S("sb", "b", ["b"]),
    S("s1", "f1", ["f1", "f2"]),
    S("sx", "x", ["x"]),
    S("su", "f2", ["f1"], false),
  ] });
  const out = sealUpdates(plan, "b", false);
  expect(out.levels.map((u) => [u._id, sorted(u["visibility.levels"])])).toEqual([
    ["b", ["b", "f1", "f2"]],
    ["f1", ["b", "f1", "f2"]],
    ["f2", ["b", "f1", "f2"]],
  ]);
  expect(out.regions.map((r) => [r._id, sorted(r.levels)])).toEqual([
    ["sb", ["b", "f1", "f2"]],
    ["s1", ["b", "f1", "f2"]],
  ]);
});

test("sealUpdates on an unknown level is empty", () => {
  const plan = buildFloorPlan({ levels: [L("b", -10, 0, ["b"])], regions: [] });
  expect(sealUpdates(plan, "zz", true)).toEqual({ levels: [], regions: [], before: { levels: [], regions: [] } });
});
