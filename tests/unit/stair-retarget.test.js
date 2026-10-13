import { activeStair, stairOpeningUpdates, stairRetargetUpdates, stairSurfaces, stateApplyUpdates } from "../../scripts/model/stair-retarget.js";
import { buildFloorPlan } from "../../scripts/model/floor-plan.js";

const rect = { type: "rectangle", x: 1, y: 2, width: 3, height: 4, rotation: 0, hole: false };
const opening = { ...rect, hole: true };
const paddedOpening = { ...rect, x: -5, y: -4, width: 15, height: 16, hole: true };
const L = (id, bottom, top) => ({ id, _id: id, name: id, elevation: { bottom, top }, visibility: { levels: new Set([id]) }, flags: { floorer: { role: "level", managed: true } } });
const S = (id, holes = [], holeShapes = []) => ({ id, _id: id, shapes: [rect, ...holeShapes], flags: { floorer: { role: "surface", levelId: id, holes, managed: true } } });
const stair = (levelId, targetLevelId) => ({ id: "st", _id: "st", shapes: [rect], flags: { floorer: { role: "stair", levelId, targetLevelId, managed: true } } });

function planWith(regions) {
  return buildFloorPlan({ levels: [L("f1", 0, 10), L("f2", 10, 20), L("f3", 20, 30)], regions });
}

test("returns null for an unknown stair, unknown target or a no-op target", () => {
  const plan = planWith([S("f1"), S("f2"), stair("f1", "f2")]);
  expect(stairRetargetUpdates(plan, "nope", "f1", "f3")).toBeNull();
  expect(stairRetargetUpdates(plan, "st", "f1", "zz")).toBeNull();
  expect(stairRetargetUpdates(plan, "st", "f1", "f1")).toBeNull();
  expect(stairRetargetUpdates(plan, "st", "zz", "f3")).toBeNull();
  expect(stairRetargetUpdates(plan, "st", "f1", "f2")).toBeNull();
});

test("keeps the viewed level fixed and re-derives band, levels, stops and flags from the new pair", () => {
  const plan = planWith([S("f1"), S("f2"), S("f3"), stair("f1", "f2")]);
  const out = stairRetargetUpdates(plan, "st", "f1", "f3");
  expect(out.stair).toEqual({
    _id: "st",
    name: "Stair f1 ↔ f3",
    elevation: { bottom: 0, top: 30, topInclusive: true },
    levels: ["f1", "f2", "f3"],
    "flags.floorer.levelId": "f1",
    "flags.floorer.targetLevelId": "f3",
    "flags.floorer.stops": ["f2"],
  });
});

test("viewing from the upper end and picking a lower target reorders the pair", () => {
  const plan = planWith([stair("f1", "f2")]);
  const out = stairRetargetUpdates(plan, "st", "f2", "f3");
  expect(out.stair).toMatchObject({ elevation: { bottom: 10, top: 30, topInclusive: true }, levels: ["f2", "f3"], "flags.floorer.levelId": "f2", "flags.floorer.targetLevelId": "f3", "flags.floorer.stops": [] });
  const down = stairRetargetUpdates(planWith([S("f2"), stair("f2", "f3")]), "st", "f3", "f1");
  expect(down.stair).toMatchObject({ elevation: { bottom: 0, top: 30, topInclusive: true }, levels: ["f1", "f2", "f3"], "flags.floorer.levelId": "f1", "flags.floorer.targetLevelId": "f3", "flags.floorer.stops": ["f2"] });
});

test("removes the old openings everywhere and cuts new ones into every level of the shaft, mirrored from the top", () => {
  const f2 = S("f2", [{ id: "u", stairId: "st" }], [opening]);
  const f1 = S("f1", [{ id: "l", stairId: "st", mirrorOf: "u" }], [opening]);
  const f3 = S("f3");
  const plan = planWith([f1, f2, f3, stair("f1", "f2")]);
  const out = stairRetargetUpdates(plan, "st", "f1", "f3");
  expect(out.surfaceRemovals.map((u) => u._id)).toEqual(["f1", "f2"]);
  expect(out.surfaceRemovals.every((u) => u["flags.floorer.holes"].length === 0)).toBe(true);
  expect(out.surfaceAdditions.map((u) => u._id)).toEqual(["f3", "f2", "f1"]);
  const [upper, stop, lower] = out.surfaceAdditions;
  expect(upper["flags.floorer.holes"]).toEqual([{ id: upper.ids[0], stairId: "st" }]);
  expect(stop["flags.floorer.holes"]).toEqual([{ id: stop.ids[0], mirrorOf: upper.ids[0], stairId: "st" }]);
  expect(lower["flags.floorer.holes"]).toEqual([{ id: lower.ids[0], mirrorOf: upper.ids[0], stairId: "st" }]);
  for (const u of out.surfaceAdditions) expect(u.shapes).toEqual([rect, paddedOpening]);
});

test("additions build on the post-removal surface state and skip unmanaged or missing surfaces", () => {
  const f2 = S("f2", [{ id: "u", stairId: "st" }, { id: "keep" }], [opening, { ...opening, x: 9 }]);
  const f1 = S("f1", [{ id: "l", stairId: "st", mirrorOf: "u" }], [opening]);
  const plan = planWith([f1, f2, stair("f1", "f2")]);
  const out = stairRetargetUpdates(plan, "st", "f2", "f3");
  expect(out.surfaceAdditions.map((u) => u._id)).toEqual(["f2"]);
  expect(out.surfaceAdditions[0]["flags.floorer.holes"]).toEqual([{ id: "keep" }, { id: out.surfaceAdditions[0].ids[0], stairId: "st" }]);
  expect(out.surfaceAdditions[0].shapes).toEqual([rect, { ...opening, x: 9 }, paddedOpening]);
  const unmanaged = { ...S("f3"), flags: { floorer: { role: "surface", levelId: "f3", holes: [], managed: false } } };
  expect(stairRetargetUpdates(planWith([f1, f2, unmanaged, stair("f1", "f2")]), "st", "f2", "f3").surfaceAdditions.map((u) => u._id)).toEqual(["f2"]);
});

test("a missing stop surface is skipped and the remaining ends still mirror from the top", () => {
  const plan = planWith([S("f1"), S("f3"), stair("f1", "f3")]);
  const out = stairOpeningUpdates(plan, stair("f1", "f3"));
  expect(out.map((u) => u._id)).toEqual(["f3", "f1"]);
  expect(out[1]["flags.floorer.holes"][0].mirrorOf).toBe(out[0].ids[0]);
});

test("stairSurfaces lists the managed surfaces of every level in the shaft, top first", () => {
  const plan = planWith([S("f1"), S("f2"), S("f3"), stair("f1", "f3")]);
  expect(stairSurfaces(plan, stair("f1", "f3")).map((s) => s.id)).toEqual(["f3", "f2", "f1"]);
  expect(stairSurfaces(plan, stair("f1", "gone"))).toEqual([]);
});

test("stairOpeningUpdates pads the cut shapes outward so tokens clear the ceiling", () => {
  const plan = planWith([S("f1"), S("f2"), stair("f1", "f2")]);
  const [upperAdd, lowerAdd] = stairOpeningUpdates(plan, { id: "st", shapes: [rect], flags: { floorer: { levelId: "f1", targetLevelId: "f2" } } });
  expect(upperAdd.shapes[1]).toMatchObject({ x: -5, y: -4, width: 15, height: 16 });
  expect(lowerAdd.shapes[1]).toMatchObject({ x: -5, y: -4, width: 15, height: 16 });
});

test("additions keep the surface id when the same surface is also in removals (document-like surface)", () => {
  class Doc {
    constructor(data) {
      Object.assign(this, data);
    }
    get id() {
      return this._id;
    }
  }
  const s1 = new Doc({ _id: "f1", shapes: [rect, opening], flags: { floorer: { role: "surface", levelId: "f1", holes: [{ id: "m", mirrorOf: "o", stairId: "st" }], managed: true } } });
  const s2 = new Doc({ _id: "f2", shapes: [rect, opening], flags: { floorer: { role: "surface", levelId: "f2", holes: [{ id: "o", stairId: "st" }], managed: true } } });
  const plan = planWith([s1, s2, S("f3"), stair("f1", "f2")]);
  const out = stairRetargetUpdates(plan, "st", "f1", "f3");
  expect(out.surfaceRemovals.map((u) => u._id).sort()).toEqual(["f1", "f2"]);
  expect(out.surfaceAdditions.map((u) => u._id).sort()).toEqual(["f1", "f2", "f3"]);
  expect(out.surfaceAdditions.every((u) => typeof u._id === "string")).toBe(true);
});

const vstair = (id, variants, { target = "f2", shapes = [rect], levels = [], elevation = null, stops = [], behaviors = [], managed = true } = {}) => ({
  id,
  _id: id,
  shapes,
  levels: new Set(levels),
  elevation,
  behaviors,
  flags: { floorer: { role: "stair", levelId: "f1", targetLevelId: target, stops, variants, managed } },
});

const beh = (id, stateId, disabled) => ({ id, disabled, flags: { floorer: { stateId } } });

test("activeStair retargets to the active level variant and otherwise to the stair's own level", () => {
  const plan = planWith([S("f1"), S("f2"), S("f3")]);
  const variants = { s1: { kind: "level", levelId: "f3" }, s2: { kind: "scene", sceneId: "sc", regionId: "rg" }, s3: { kind: "off" }, s4: { kind: "level", levelId: "gone" } };
  const st = vstair("st", variants);
  const targetOf = (activeId) => activeStair(plan, st, activeId).flags.floorer.targetLevelId;
  expect(targetOf("s1")).toBe("f3");
  expect(targetOf("s2")).toBe("f1");
  expect(targetOf("s3")).toBe("f1");
  expect(targetOf("s4")).toBe("f1");
  expect(targetOf(null)).toBe("f1");
  expect(activeStair(plan, stair("f1", "f2"), "s1").flags.floorer.targetLevelId).toBe("f2");
});

test("stateApplyUpdates leaves stairs without variants alone", () => {
  expect(stateApplyUpdates(planWith([S("f1"), S("f2"), stair("f1", "f2")]), "s1")).toEqual({ stairs: [], behaviors: [], surfaces: [] });
});

test("the active level variant sets the stair's tags, band, stops and target and cuts that pair's openings", () => {
  const st = vstair("st", { s1: { kind: "level", levelId: "f3" } });
  const out = stateApplyUpdates(planWith([S("f1"), S("f2"), S("f3"), st]), "s1");
  expect(out.stairs).toEqual([{ _id: "st", levels: ["f1", "f2", "f3"], elevation: { bottom: 0, top: 30, topInclusive: true }, "flags.floorer.targetLevelId": "f3", "flags.floorer.stops": ["f2"] }]);
  expect(out.surfaces.map((u) => u._id)).toEqual(["f3", "f2", "f1"]);
  for (const u of out.surfaces) expect(u.shapes).toEqual([rect, paddedOpening]);
});

test("another variant's level is never a stop of the active pair", () => {
  const st = vstair("st", { s1: { kind: "level", levelId: "f3" }, s2: { kind: "level", levelId: "f2" } });
  const out = stateApplyUpdates(planWith([S("f1"), S("f2"), S("f3"), st]), "s1");
  expect(out.stairs[0]).toMatchObject({ levels: ["f1", "f3"], "flags.floorer.stops": [], "flags.floorer.targetLevelId": "f3" });
  expect(out.surfaces.map((u) => u._id)).toEqual(["f3", "f1"]);
});

test("an off or cross-scene variant leaves the stair tagged to its own level with no climb", () => {
  const st = vstair("st", { s1: { kind: "off" }, s2: { kind: "scene", sceneId: "sc", regionId: "rg" } });
  const own = { _id: "st", levels: ["f1"], elevation: { bottom: 0, top: 10, topInclusive: true }, "flags.floorer.targetLevelId": "f1", "flags.floorer.stops": [] };
  for (const activeId of ["s1", "s2", null]) {
    const out = stateApplyUpdates(planWith([S("f1"), S("f2"), S("f3"), st]), activeId);
    expect(out.stairs).toEqual([own]);
    expect(out.surfaces.map((u) => u._id)).toEqual(["f1"]);
  }
});

test("stored stops and target left by another variant cannot make the update look settled", () => {
  const variants = { s1: { kind: "level", levelId: "f3" }, s2: { kind: "level", levelId: "f2" } };
  const st = vstair("st", variants, { target: "f2", levels: ["f1", "f2", "f3"], elevation: { bottom: 0, top: 30, topInclusive: true }, stops: ["f2"] });
  const out = stateApplyUpdates(planWith([S("f1"), S("f2"), S("f3"), st]), "s1");
  expect(out.stairs).toEqual([{ _id: "st", levels: ["f1", "f3"], elevation: { bottom: 0, top: 30, topInclusive: true }, "flags.floorer.targetLevelId": "f3", "flags.floorer.stops": [] }]);
});

test("switching between two level variants yields exactly one stair update each way", () => {
  const variants = { s1: { kind: "level", levelId: "f3" }, s2: { kind: "level", levelId: "f2" } };
  const toF3 = vstair("st", variants, { target: "f2", levels: ["f1", "f2"], elevation: { bottom: 0, top: 20, topInclusive: true } });
  const up = stateApplyUpdates(planWith([S("f1"), S("f2"), S("f3"), toF3]), "s1");
  expect(up.stairs).toHaveLength(1);
  expect(up.stairs[0]).toMatchObject({ levels: ["f1", "f3"], "flags.floorer.targetLevelId": "f3" });
  const toF2 = vstair("st", variants, { target: "f3", levels: ["f1", "f3"], elevation: { bottom: 0, top: 30, topInclusive: true } });
  const down = stateApplyUpdates(planWith([S("f1"), S("f2"), S("f3"), toF2]), "s2");
  expect(down.stairs).toHaveLength(1);
  expect(down.stairs[0]).toMatchObject({ levels: ["f1", "f2"], "flags.floorer.targetLevelId": "f2" });
});

test("switching away from a level variant strips the openings it left behind", () => {
  const f3 = S("f3", [{ id: "u", stairId: "st" }], [opening]);
  const f1 = S("f1", [{ id: "l", stairId: "st", mirrorOf: "u" }], [opening]);
  const st = vstair("st", { s1: { kind: "level", levelId: "f3" }, s2: { kind: "off" } });
  const out = stateApplyUpdates(planWith([f1, S("f2"), f3, st]), "s2");
  expect(out.surfaces.map((u) => u._id).sort()).toEqual(["f1", "f3"]);
  const upper = out.surfaces.find((u) => u._id === "f3");
  const own = out.surfaces.find((u) => u._id === "f1");
  expect(upper["flags.floorer.holes"]).toEqual([]);
  expect(upper.shapes).toEqual([rect]);
  expect(own["flags.floorer.holes"]).toEqual([{ id: expect.any(String), stairId: "st" }]);
  expect(own.shapes).toEqual([rect, paddedOpening]);
});

test("re-applying the state a stair is already in yields no stair and no surface update", () => {
  const openings = [{ id: "u", stairId: "st" }];
  const f3 = S("f3", openings, [paddedOpening]);
  const f2 = S("f2", [{ id: "m", stairId: "st", mirrorOf: "u" }], [paddedOpening]);
  const f1 = S("f1", [{ id: "l", stairId: "st", mirrorOf: "u" }], [paddedOpening]);
  const st = vstair("st", { s1: { kind: "level", levelId: "f3" } }, { target: "f3", levels: ["f3", "f2", "f1"], elevation: { bottom: 0, top: 30, topInclusive: true }, stops: ["f2"] });
  const out = stateApplyUpdates(planWith([f1, f2, f3, st]), "s1");
  expect(out.stairs).toEqual([]);
  expect(out.surfaces).toEqual([]);
});

test("stateApplyUpdates carries the behavior toggles and skips the stairs whose behaviors already match", () => {
  const a = vstair("a", { s1: { kind: "off" } }, { behaviors: [beh("b1", "s1", true), beh("b2", "s2", false)] });
  const b = vstair("b", { s1: { kind: "off" } }, { shapes: [{ ...rect, x: 40 }], behaviors: [beh("b3", "s1", false)] });
  const out = stateApplyUpdates(planWith([S("f1"), S("f2"), a, b]), "s1");
  expect(out.behaviors).toEqual([{ regionId: "a", updates: [{ _id: "b1", disabled: false }, { _id: "b2", disabled: true }] }]);
});

test("two variant stairs sharing a floor produce one merged surface update", () => {
  const a = vstair("a", { s1: { kind: "level", levelId: "f2" } });
  const b = vstair("b", { s1: { kind: "off" } }, { shapes: [{ ...rect, x: 40 }] });
  const out = stateApplyUpdates(planWith([S("f1"), S("f2"), a, b]), "s1");
  expect(out.surfaces.map((u) => u._id).sort()).toEqual(["f1", "f2"]);
  const f1 = out.surfaces.find((u) => u._id === "f1");
  expect(f1["flags.floorer.holes"].map((h) => h.stairId)).toEqual(["a", "b"]);
  expect(f1.shapes).toHaveLength(3);
});

test("a missing or unmanaged own surface is skipped", () => {
  const st = vstair("st", { s1: { kind: "off" } });
  expect(stateApplyUpdates(planWith([S("f2"), st]), "s1").surfaces).toEqual([]);
  const unmanaged = { ...S("f1"), flags: { floorer: { role: "surface", levelId: "f1", holes: [], managed: false } } };
  expect(stateApplyUpdates(planWith([unmanaged, st]), "s1").surfaces).toEqual([]);
});
