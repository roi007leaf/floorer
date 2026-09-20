import { lint, sameSet } from "../../scripts/model/issues.js";
import { buildFloorPlan } from "../../scripts/model/floor-plan.js";

const L = (id, bottom, top, vis) => ({ id, _id: id, name: id, elevation: { bottom, top }, visibility: { levels: new Set(vis) }, flags: { floorer: { role: "level", managed: true } } });
const S = (id, levelId, { levels, elevation, holes = [] }) => ({
  id, _id: id, levels: new Set(levels), elevation, shapes: [], flags: { floorer: { role: "surface", levelId, holes, managed: true } },
});
const ST = (id, levelId, targetLevelId, { levels, elevation }) => ({
  id, _id: id, levels: new Set(levels), elevation, shapes: [{ type: "rectangle", x: 0, y: 0, width: 1, height: 1, hole: false }], flags: { floorer: { role: "stair", levelId, targetLevelId, managed: true } },
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
    S("s1", "f1", { levels: ["f1", "f2"], elevation: { bottom: 0, top: 10 } }),
    S("s2", "f2", { levels: ["f1", "f2"], elevation: { bottom: 10, top: 20 } }),
    ST("st", "f1", "f2", { levels: ["f1", "f2"], elevation: { bottom: 0, top: 10 } }),
  ] });
  expect(lint(plan)).toEqual([]);
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
  expect(issue.fix.data).toEqual({ _id: "s1", elevation: { bottom: 0, top: 10 }, topInclusive: true });
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
  expect(issues.find((i) => i.id === "stair-band").fix.data).toEqual({ _id: "st", elevation: { bottom: 0, top: 10 }, topInclusive: true });
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
