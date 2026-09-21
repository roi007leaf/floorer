import { bandChangeUpdates, bandGaps, parseBand } from "../../scripts/model/band-edit.js";
import { buildFloorPlan } from "../../scripts/model/floor-plan.js";

const L = (id, bottom, top, managed = true) => ({ id, _id: id, name: id, elevation: { bottom, top }, flags: managed ? { floorer: { role: "level", managed: true } } : {} });
const R = (id, role, levelId, extra = {}, managed = true) => ({ id, _id: id, elevation: { bottom: 0, top: 10, topInclusive: true }, flags: { floorer: { role, levelId, managed, ...extra } } });
const T = (id, level, elevation) => ({ id, _id: id, level, elevation });

function plan() {
  return buildFloorPlan({
    levels: [L("f1", 0, 10), L("f2", 10, 20), L("r", 20, Infinity)],
    regions: [
      R("s1", "surface", "f1"),
      R("st", "stair", "f1", { targetLevelId: "f2" }),
      R("s2", "surface", "f2"),
      R("st2", "stair", "f2", { targetLevelId: "r" }),
      R("sx", "stair", "f1", { targetLevelId: "f2" }, false),
    ],
    tokens: [T("t1", "f1", 0), T("t2", "f1", 5), T("t3", "f2", 10)],
  });
}

test("bandChangeUpdates moves the level, its surface and owned managed stairs", () => {
  const out = bandChangeUpdates(plan(), "f1", { bottom: -5, top: 12 });
  expect(out.levels).toEqual([{ _id: "f1", elevation: { bottom: -5, top: 12 } }]);
  expect(out.regions).toEqual([
    { _id: "s1", elevation: { bottom: -5, top: 12, topInclusive: true } },
    { _id: "st", elevation: { bottom: -5, top: 12, topInclusive: true } },
  ]);
});

test("bandChangeUpdates moves only tokens resting on the old bottom", () => {
  const out = bandChangeUpdates(plan(), "f1", { bottom: -5, top: 12 });
  expect(out.tokens).toEqual([{ _id: "t1", elevation: -5 }]);
  expect(out.before.tokens).toEqual([{ _id: "t1", elevation: 0 }]);
});

test("bandChangeUpdates blank bottom rests tokens at 0", () => {
  const out = bandChangeUpdates(plan(), "f1", { bottom: null, top: 12 });
  expect(out.tokens).toEqual([{ _id: "t1", elevation: 0 }]);
  expect(out.levels[0].elevation).toEqual({ bottom: null, top: 12 });
});

test("bandChangeUpdates captures before data with normalised infinities", () => {
  const out = bandChangeUpdates(plan(), "r", { bottom: 25, top: null });
  expect(out.before.levels).toEqual([{ _id: "r", elevation: { bottom: 20, top: null } }]);
  expect(out.before.regions).toEqual([]);
  expect(out.regions).toEqual([]);
});

test("bandChangeUpdates skips unmanaged surface and unknown level", () => {
  const p = buildFloorPlan({ levels: [L("f1", 0, 10)], regions: [R("s1", "surface", "f1", {}, false)], tokens: [] });
  const out = bandChangeUpdates(p, "f1", { bottom: 1, top: 2 });
  expect(out.regions).toEqual([]);
  expect(out.before.regions).toEqual([]);
  expect(bandChangeUpdates(p, "zz", { bottom: 1, top: 2 })).toEqual({ levels: [], regions: [], tokens: [], before: { levels: [], regions: [], tokens: [] } });
});

test("bandGaps lists gaps between consecutive managed levels", () => {
  const p = buildFloorPlan({ levels: [L("f1", 0, 10), L("f2", 15, 20), L("x", 20, 25, false), L("r", 30, Infinity)], regions: [] });
  expect(bandGaps(p)).toEqual([
    { lowerId: "f1", upperId: "f2", gap: 5 },
    { lowerId: "f2", upperId: "r", gap: 10 },
  ]);
});

test("bandGaps ignores open-ended and touching bands", () => {
  const p = buildFloorPlan({ levels: [L("b", -Infinity, 0), L("f1", 0, 10), L("r", 10, Infinity)], regions: [] });
  expect(bandGaps(p)).toEqual([]);
  expect(bandGaps(buildFloorPlan({ levels: [L("a", 0, null), L("b", 20, 30)], regions: [] }))).toEqual([]);
});

test("parseBand accepts numbers and blanks, rejects junk and inverted bands", () => {
  expect(parseBand({ bottom: "0", top: " 10 " })).toEqual({ bottom: 0, top: 10 });
  expect(parseBand({ bottom: "", top: "10" })).toEqual({ bottom: null, top: 10 });
  expect(parseBand({ bottom: "-5.5", top: "" })).toEqual({ bottom: -5.5, top: null });
  expect(parseBand({ bottom: "", top: "" })).toEqual({ bottom: null, top: null });
  expect(parseBand({ bottom: "abc", top: "10" })).toBeNull();
  expect(parseBand({ bottom: "10", top: "0" })).toBeNull();
  expect(parseBand({ bottom: "5", top: "5" })).toEqual({ bottom: 5, top: 5 });
});
