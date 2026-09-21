import { lint, sameSet } from "../../scripts/model/issues.js";
import { buildFloorPlan } from "../../scripts/model/floor-plan.js";

const L = (id, bottom, top, vis) => ({ id, _id: id, name: id, elevation: { bottom, top }, visibility: { levels: new Set(vis) }, flags: { floorer: { role: "level", managed: true } } });
const S = (id, levelId, { levels, elevation, holes = [] }) => ({
  id, _id: id, levels: new Set(levels), elevation: { topInclusive: true, ...elevation }, shapes: [], flags: { floorer: { role: "surface", levelId, holes, managed: true } },
});
const ST = (id, levelId, targetLevelId, { levels, elevation }) => ({
  id, _id: id, levels: new Set(levels), elevation: { topInclusive: true, ...elevation }, shapes: [{ type: "rectangle", x: 0, y: 0, width: 1, height: 1, hole: false }], flags: { floorer: { role: "stair", levelId, targetLevelId, managed: true } },
});
const ids = (issues) => issues.map((i) => i.id);

const f1 = () => L("f1", 0, 10, ["f1", "f2"]);
const f2 = () => L("f2", 10, 20, ["f1", "f2"]);

test("sameSet", () => {
  expect(sameSet(new Set(["a", "b"]), ["b", "a"])).toBe(true);
  expect(sameSet(["a"], ["a", "b"])).toBe(false);
});

test("clean plan has no issues", () => {
  const plan = buildFloorPlan({ levels: [f1(), f2()], regions: [
    S("s1", "f1", { levels: ["f1", "f2"], elevation: { bottom: 0, top: 10 }, holes: [{ id: "so1", stairId: "st", mirrorOf: "so2" }] }),
    S("s2", "f2", { levels: ["f1", "f2"], elevation: { bottom: 10, top: 20 }, holes: [{ id: "so2", stairId: "st" }] }),
    ST("st", "f1", "f2", { levels: ["f1", "f2"], elevation: { bottom: 0, top: 20 } }),
  ] });
  expect(lint(plan)).toEqual([]);
});

const f3 = () => L("f3", 20, 30, ["f3"]);

function shaftPlan({ levels, elevation, stops, holes = { s1: true, s2: true, s3: true } }) {
  return buildFloorPlan({ levels: [f1(), f2(), f3()], regions: [
    S("s1", "f1", { levels: ["f1", "f2"], elevation: { bottom: 0, top: 10 }, holes: holes.s1 ? [{ id: "so1", stairId: "st", mirrorOf: "so3" }] : [] }),
    S("s2", "f2", { levels: ["f1", "f2"], elevation: { bottom: 10, top: 20 }, holes: holes.s2 ? [{ id: "so2", stairId: "st", mirrorOf: "so3" }] : [] }),
    S("s3", "f3", { levels: ["f3"], elevation: { bottom: 20, top: 30 }, holes: holes.s3 ? [{ id: "so3", stairId: "st" }] : [] }),
    { ...ST("st", "f1", "f3", { levels, elevation }), flags: { floorer: { role: "stair", levelId: "f1", targetLevelId: "f3", stops, managed: true } } },
  ] });
}

test("three-level shaft tagged to every level with openings everywhere is clean", () => {
  expect(lint(shaftPlan({ levels: ["f1", "f2", "f3"], elevation: { bottom: 0, top: 30 }, stops: ["f2"] }))).toEqual([]);
});

test("stair-levels fix tags the intermediate level and records it as a stop", () => {
  const issues = lint(shaftPlan({ levels: ["f1", "f3"], elevation: { bottom: 0, top: 30 }, stops: [] }));
  expect(ids(issues)).toEqual(["stair-levels"]);
  expect(issues[0].fix.data).toEqual({ _id: "st", levels: ["f1", "f2", "f3"], "flags.floorer.stops": ["f2"] });
});

test("stair-levels flags a stale stops flag even when the tag set is right", () => {
  const issues = lint(shaftPlan({ levels: ["f1", "f2", "f3"], elevation: { bottom: 0, top: 30 }, stops: [] }));
  expect(ids(issues)).toEqual(["stair-levels"]);
});

test("stair-band fix spans lower bottom to upper top across the shaft", () => {
  const issues = lint(shaftPlan({ levels: ["f1", "f2", "f3"], elevation: { bottom: 0, top: 10 }, stops: ["f2"] }));
  expect(ids(issues)).toEqual(["stair-band"]);
  expect(issues[0].fix.data).toEqual({ _id: "st", elevation: { bottom: 0, top: 30, topInclusive: true } });
});

test("stair-openings cuts the missing stop opening mirrored from the top surface", () => {
  const issues = lint(shaftPlan({ levels: ["f1", "f2", "f3"], elevation: { bottom: 0, top: 30 }, stops: ["f2"], holes: { s1: true, s2: false, s3: true } }));
  expect(ids(issues)).toEqual(["stair-openings"]);
  expect(issues[0].fix.data._id).toBe("s2");
  expect(issues[0].fix.data["flags.floorer.holes"][0]).toEqual({ id: expect.any(String), mirrorOf: "so3", stairId: "st" });
  expect(issues[0].fix.cascade).toEqual([]);
});

test("stair-openings with no openings anywhere cuts all three, mirrored from the top", () => {
  const issues = lint(shaftPlan({ levels: ["f1", "f2", "f3"], elevation: { bottom: 0, top: 30 }, stops: ["f2"], holes: { s1: false, s2: false, s3: false } }));
  const { data, cascade } = issues[0].fix;
  expect(data._id).toBe("s3");
  expect(cascade.map((u) => u._id)).toEqual(["s2", "s1"]);
  expect(cascade.every((u) => u["flags.floorer.holes"][0].mirrorOf === data["flags.floorer.holes"][0].id)).toBe(true);
});

test("stair-openings with only the top missing appends it without a mirror and leaves the rest alone", () => {
  const issues = lint(shaftPlan({ levels: ["f1", "f2", "f3"], elevation: { bottom: 0, top: 30 }, stops: ["f2"], holes: { s1: true, s2: true, s3: false } }));
  const { data, cascade } = issues[0].fix;
  expect(data._id).toBe("s3");
  expect(data["flags.floorer.holes"][0].mirrorOf).toBeUndefined();
  expect(cascade).toEqual([]);
});

test("surface-missing yields footprint intent fix", () => {
  const plan = buildFloorPlan({ levels: [f1()], regions: [] });
  const [issue] = lint(plan);
  expect(issue.id).toBe("surface-missing");
  expect(issue.fix).toEqual({ intent: "footprint", levelId: "f1" });
});

test("surface-levels fix rewrites levels", () => {
  const plan = buildFloorPlan({ levels: [f1(), f2()], regions: [
    S("s1", "f1", { levels: ["f1"], elevation: { bottom: 0, top: 10 } }),
    S("s2", "f2", { levels: ["f1", "f2"], elevation: { bottom: 10, top: 20 } }),
  ] });
  const issue = lint(plan).find((i) => i.id === "surface-levels");
  expect(issue.docId).toBe("s1");
  expect(issue.fix.collection).toBe("regions");
  expect(issue.fix.data.levels.sort()).toEqual(["f1", "f2"]);
});

test("surface-band fix rewrites elevation", () => {
  const plan = buildFloorPlan({ levels: [f1()], regions: [S("s1", "f1", { levels: ["f1"], elevation: { bottom: 0, top: 5 } })] });
  const issue = lint(plan).find((i) => i.id === "surface-band");
  expect(issue.fix.data).toEqual({ _id: "s1", elevation: { bottom: 0, top: 10, topInclusive: true } });
});

test("surface-band flags a surface whose top is not inclusive", () => {
  const plan = buildFloorPlan({ levels: [f1()], regions: [S("s1", "f1", { levels: ["f1"], elevation: { bottom: 0, top: 10, topInclusive: false } })] });
  const issue = lint(plan).find((i) => i.id === "surface-band");
  expect(issue.fix.data).toEqual({ _id: "s1", elevation: { bottom: 0, top: 10, topInclusive: true } });
});

test("live roof level and surface with Infinity top are clean", () => {
  const roof = L("r", 10, Infinity, ["f1", "r"]);
  const plan = buildFloorPlan({ levels: [f1(), roof], regions: [
    S("s1", "f1", { levels: ["f1", "r"], elevation: { bottom: 0, top: 10 } }),
    S("sr", "r", { levels: ["r"], elevation: { bottom: 10, top: Infinity } }),
  ] });
  expect(lint(plan)).toEqual([]);
});

test("surface-band fix on a live roof writes a null top", () => {
  const roof = L("r", 10, Infinity, ["r"]);
  const plan = buildFloorPlan({ levels: [roof], regions: [S("sr", "r", { levels: ["r"], elevation: { bottom: 10, top: 30 } })] });
  const issue = lint(plan).find((i) => i.id === "surface-band");
  expect(issue.fix.data).toEqual({ _id: "sr", elevation: { bottom: 10, top: null, topInclusive: true } });
});

test("level-overlap treats live Infinity top as open", () => {
  const plan = buildFloorPlan({ levels: [L("r", 10, Infinity, ["r"]), L("x", 15, 20, ["x"])], regions: [
    S("sr", "r", { levels: ["r"], elevation: { bottom: 10, top: Infinity } }),
    S("sx", "x", { levels: ["x"], elevation: { bottom: 15, top: 20 } }),
  ] });
  expect(ids(lint(plan))).toContain("level-overlap");
});

test("hole-unmirrored fix appends mirror to level below", () => {
  const hole = { type: "rectangle", x: 0, y: 0, width: 1, height: 1, hole: true };
  const s2 = S("s2", "f2", { levels: ["f1", "f2"], elevation: { bottom: 10, top: 20 }, holes: [{ id: "h1" }] });
  s2.shapes = [hole];
  const s1 = S("s1", "f1", { levels: ["f1", "f2"], elevation: { bottom: 0, top: 10 } });
  const plan = buildFloorPlan({ levels: [f1(), f2()], regions: [s1, s2] });
  const issue = lint(plan).find((i) => i.id === "hole-unmirrored");
  expect(issue.docId).toBe("s2");
  expect(issue.fix.data._id).toBe("s1");
  expect(issue.fix.data["flags.floorer.holes"][0].mirrorOf).toBe("h1");
});

test("hole already mirrored is clean", () => {
  const hole = { type: "rectangle", x: 0, y: 0, width: 1, height: 1, hole: true };
  const s2 = S("s2", "f2", { levels: ["f1", "f2"], elevation: { bottom: 10, top: 20 }, holes: [{ id: "h1" }] });
  s2.shapes = [hole];
  const s1 = S("s1", "f1", { levels: ["f1", "f2"], elevation: { bottom: 0, top: 10 }, holes: [{ id: "m1", mirrorOf: "h1" }] });
  s1.shapes = [hole];
  const plan = buildFloorPlan({ levels: [f1(), f2()], regions: [s1, s2] });
  expect(ids(lint(plan))).not.toContain("hole-unmirrored");
});

test("stair-levels and stair-band", () => {
  const plan = buildFloorPlan({ levels: [f1(), f2()], regions: [
    S("s1", "f1", { levels: ["f1", "f2"], elevation: { bottom: 0, top: 10 } }),
    S("s2", "f2", { levels: ["f1", "f2"], elevation: { bottom: 10, top: 20 } }),
    ST("st", "f1", "f2", { levels: ["f1"], elevation: { bottom: 10, top: 20 } }),
  ] });
  const issues = lint(plan);
  expect(ids(issues)).toEqual(expect.arrayContaining(["stair-levels", "stair-band"]));
  expect(issues.find((i) => i.id === "stair-levels").fix.data.levels).toEqual(["f1", "f2"]);
  expect(issues.find((i) => i.id === "stair-band").fix.data).toEqual({ _id: "st", elevation: { bottom: 0, top: 20, topInclusive: true } });
});

test("stair-target-missing", () => {
  const plan = buildFloorPlan({ levels: [f1()], regions: [
    S("s1", "f1", { levels: ["f1"], elevation: { bottom: 0, top: 10 } }),
    ST("st", "f1", "gone", { levels: ["f1"], elevation: { bottom: 0, top: 10 } }),
  ] });
  const issue = lint(plan).find((i) => i.id === "stair-target-missing");
  expect(issue.fix).toEqual({ prompt: "stair-target", docId: "st" });
});

test("unmanaged surface with wrong levels yields no surface-levels issue", () => {
  const s1 = S("s1", "f1", { levels: ["f1"], elevation: { bottom: 0, top: 10 } });
  s1.flags.floorer.managed = false;
  const plan = buildFloorPlan({ levels: [f1(), f2()], regions: [
    s1,
    S("s2", "f2", { levels: ["f1", "f2"], elevation: { bottom: 10, top: 20 } }),
  ] });
  expect(ids(lint(plan))).not.toContain("surface-levels");
});

test("hole on managed surface whose below surface is unmanaged yields no hole-unmirrored", () => {
  const hole = { type: "rectangle", x: 0, y: 0, width: 1, height: 1, hole: true };
  const s2 = S("s2", "f2", { levels: ["f1", "f2"], elevation: { bottom: 10, top: 20 }, holes: [{ id: "h1" }] });
  s2.shapes = [hole];
  const s1 = S("s1", "f1", { levels: ["f1", "f2"], elevation: { bottom: 0, top: 10 } });
  s1.flags.floorer.managed = false;
  const plan = buildFloorPlan({ levels: [f1(), f2()], regions: [s1, s2] });
  expect(ids(lint(plan))).not.toContain("hole-unmirrored");
});

test("unmanaged stair with wrong levels yields no stair-levels issue", () => {
  const st = ST("st", "f1", "f2", { levels: ["f1"], elevation: { bottom: 0, top: 10 } });
  st.flags.floorer.managed = false;
  const plan = buildFloorPlan({ levels: [f1(), f2()], regions: [
    S("s1", "f1", { levels: ["f1", "f2"], elevation: { bottom: 0, top: 10 } }),
    S("s2", "f2", { levels: ["f1", "f2"], elevation: { bottom: 10, top: 20 } }),
    st,
  ] });
  expect(ids(lint(plan))).not.toContain("stair-levels");
});

test("level-overlap has no fix", () => {
  const plan = buildFloorPlan({ levels: [L("a", 0, 10, ["a"]), L("b", 5, 15, ["b"])], regions: [
    S("sa", "a", { levels: ["a"], elevation: { bottom: 0, top: 10 } }),
    S("sb", "b", { levels: ["b"], elevation: { bottom: 5, top: 15 } }),
  ] });
  const issue = lint(plan).find((i) => i.id === "level-overlap");
  expect(issue.fix).toBeNull();
});

test("level-gap flags the upper level and cascades the fix to its regions", () => {
  const plan = buildFloorPlan({ levels: [f1(), L("f2", 15, 20, ["f1", "f2"])], regions: [
    S("s1", "f1", { levels: ["f1", "f2"], elevation: { bottom: 0, top: 10 } }),
    S("s2", "f2", { levels: ["f1", "f2"], elevation: { bottom: 15, top: 20 } }),
    ST("st", "f1", "f2", { levels: ["f1", "f2"], elevation: { bottom: 0, top: 20 } }),
  ] });
  const issue = lint(plan).find((i) => i.id === "level-gap");
  expect(issue).toMatchObject({ levelId: "f2", docId: "f1", label: "FLOORER.Issue.level-gap" });
  expect(issue.fix).toEqual({
    collection: "levels",
    op: "update",
    data: { _id: "f2", elevation: { bottom: 10, top: 20 } },
    cascade: [
      { _id: "s2", elevation: { bottom: 10, top: 20, topInclusive: true } },
      { _id: "st", elevation: { bottom: 0, top: 20, topInclusive: true } },
    ],
  });
});

test("stair-openings flags a stair with no opening on either side", () => {
  const plan = buildFloorPlan({ levels: [f1(), f2()], regions: [
    S("s1", "f1", { levels: ["f1", "f2"], elevation: { bottom: 0, top: 10 } }),
    S("s2", "f2", { levels: ["f1", "f2"], elevation: { bottom: 10, top: 20 } }),
    ST("st", "f1", "f2", { levels: ["f1", "f2"], elevation: { bottom: 0, top: 10 } }),
  ] });
  const issue = lint(plan).find((i) => i.id === "stair-openings");
  expect(issue).toMatchObject({ levelId: "f1", docId: "st", label: "FLOORER.Issue.stair-openings" });
  expect(issue.fix.collection).toBe("regions");
  expect(issue.fix.data._id).toBe("s2");
  expect(issue.fix.data["flags.floorer.holes"][0].stairId).toBe("st");
  expect(issue.fix.data["flags.floorer.holes"][0].mirrorOf).toBeUndefined();
  expect(issue.fix.cascade).toHaveLength(1);
  expect(issue.fix.cascade[0]._id).toBe("s1");
  expect(issue.fix.cascade[0]["flags.floorer.holes"][0].stairId).toBe("st");
  expect(issue.fix.cascade[0]["flags.floorer.holes"][0].mirrorOf).toBe(issue.fix.data["flags.floorer.holes"][0].id);
});

test("stair-openings is clean when both sides already have the opening", () => {
  const plan = buildFloorPlan({ levels: [f1(), f2()], regions: [
    S("s1", "f1", { levels: ["f1", "f2"], elevation: { bottom: 0, top: 10 }, holes: [{ id: "so1", stairId: "st", mirrorOf: "so2" }] }),
    S("s2", "f2", { levels: ["f1", "f2"], elevation: { bottom: 10, top: 20 }, holes: [{ id: "so2", stairId: "st" }] }),
    ST("st", "f1", "f2", { levels: ["f1", "f2"], elevation: { bottom: 0, top: 10 } }),
  ] });
  expect(ids(lint(plan))).not.toContain("stair-openings");
});

test("stair-openings targets only the lower surface when the upper already has the opening", () => {
  const plan = buildFloorPlan({ levels: [f1(), f2()], regions: [
    S("s1", "f1", { levels: ["f1", "f2"], elevation: { bottom: 0, top: 10 } }),
    S("s2", "f2", { levels: ["f1", "f2"], elevation: { bottom: 10, top: 20 }, holes: [{ id: "so2", stairId: "st" }] }),
    ST("st", "f1", "f2", { levels: ["f1", "f2"], elevation: { bottom: 0, top: 10 } }),
  ] });
  const issue = lint(plan).find((i) => i.id === "stair-openings");
  expect(issue.fix.data._id).toBe("s1");
  expect(issue.fix.data["flags.floorer.holes"][0].stairId).toBe("st");
  expect(issue.fix.data["flags.floorer.holes"][0].mirrorOf).toBe("so2");
  expect(issue.fix.cascade).toEqual([]);
});

test("a stair across a band gap spans the gap and raises only level-gap", () => {
  const far = L("far", 20, 30, ["f1", "far"]);
  const plan = buildFloorPlan({ levels: [f1(), far], regions: [
    S("s1", "f1", { levels: ["f1", "far"], elevation: { bottom: 0, top: 10 }, holes: [{ id: "so1", stairId: "st", mirrorOf: "sof" }] }),
    S("sf", "far", { levels: ["far"], elevation: { bottom: 20, top: 30 }, holes: [{ id: "sof", stairId: "st" }] }),
    ST("st", "f1", "far", { levels: ["f1", "far"], elevation: { bottom: 0, top: 30 } }),
  ] });
  expect(ids(lint(plan))).toEqual(["level-gap"]);
});

test("a stair between overlapping bands still spans lower bottom to upper top", () => {
  const over = L("over", 5, 15, ["f1", "over"]);
  const plan = buildFloorPlan({ levels: [f1(), over], regions: [
    S("s1", "f1", { levels: ["f1", "over"], elevation: { bottom: 0, top: 10 }, holes: [{ id: "so1", stairId: "st", mirrorOf: "soo" }] }),
    S("so", "over", { levels: ["over"], elevation: { bottom: 5, top: 15 }, holes: [{ id: "soo", stairId: "st" }] }),
    ST("st", "f1", "over", { levels: ["f1", "over"], elevation: { bottom: 0, top: 10 } }),
  ] });
  const issues = lint(plan);
  expect(ids(issues)).toEqual(["stair-band", "level-overlap"]);
  expect(issues[0].fix.data.elevation).toEqual({ bottom: 0, top: 15, topInclusive: true });
});

test("level-overlap is severity info", () => {
  const plan = buildFloorPlan({ levels: [L("a", 0, 10, ["a"]), L("b", 5, 15, ["b"])], regions: [
    S("sa", "a", { levels: ["a"], elevation: { bottom: 0, top: 10 } }),
    S("sb", "b", { levels: ["b"], elevation: { bottom: 5, top: 15 } }),
  ] });
  const issue = lint(plan).find((i) => i.id === "level-overlap");
  expect(issue.severity).toBe("info");
});

test("level-gap is severity warning", () => {
  const plan = buildFloorPlan({ levels: [f1(), L("f2", 15, 20, ["f1", "f2"])], regions: [
    S("s1", "f1", { levels: ["f1", "f2"], elevation: { bottom: 0, top: 10 } }),
    S("s2", "f2", { levels: ["f1", "f2"], elevation: { bottom: 15, top: 20 } }),
  ] });
  const issue = lint(plan).find((i) => i.id === "level-gap");
  expect(issue.severity).toBe("warning");
});

test("touching managed levels have no level-gap", () => {
  const plan = buildFloorPlan({ levels: [f1(), f2()], regions: [
    S("s1", "f1", { levels: ["f1", "f2"], elevation: { bottom: 0, top: 10 } }),
    S("s2", "f2", { levels: ["f1", "f2"], elevation: { bottom: 10, top: 20 } }),
  ] });
  expect(ids(lint(plan))).not.toContain("level-gap");
});

test("stair openings are never reported as unmirrored holes", () => {
  const hole = { type: "rectangle", x: 0, y: 0, width: 1, height: 1, hole: true };
  const s2 = S("s2", "f2", { levels: ["f1", "f2"], elevation: { bottom: 10, top: 20 }, holes: [{ id: "h1", stairId: "st" }] });
  s2.shapes = [hole];
  const s1 = S("s1", "f1", { levels: ["f1", "f2"], elevation: { bottom: 0, top: 10 } });
  const plan = buildFloorPlan({ levels: [f1(), f2()], regions: [s1, s2] });
  expect(ids(lint(plan))).not.toContain("hole-unmirrored");
});
