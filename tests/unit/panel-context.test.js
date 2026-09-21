import { issueKey, panelContext } from "../../scripts/ui/panel-actions.js";
import { buildFloorPlan } from "../../scripts/model/floor-plan.js";

const L = (id, bottom, top, vis, kind = "floor") => ({ id, _id: id, name: id, elevation: { bottom, top }, visibility: { levels: new Set(vis) }, flags: { floorer: { role: "level", kind, managed: true } } });

test("panelContext rows", () => {
  const plan = buildFloorPlan({ levels: [L("b", -10, 0, ["b"], "basement"), L("f1", 0, 10, ["f1", "r"]), L("r", 10, null, ["f1", "r"], "roof")], regions: [
    { id: "s", flags: { floorer: { role: "surface", levelId: "f1", holes: [{ id: "h" }, { id: "o", stairId: "st" }], managed: true } } },
    { id: "st", flags: { floorer: { role: "stair", levelId: "f1", targetLevelId: "r", managed: true } } },
  ] });
  const ctx = panelContext(plan, { activeLevelId: "f1", issues: [{ id: "surface-missing", label: "x", levelId: "b", fix: { intent: "footprint", levelId: "b" } }], intent: null, journalSize: 2, isolationEnabled: true });
  expect(ctx.rows.map((r) => r.id)).toEqual(["r", "f1", "b"]);
  const f1 = ctx.rows[1];
  expect(f1).toMatchObject({ active: true, hasSurface: true, holeCount: 1, openingCount: 1, stairCount: 1, stairLinks: "\u2194 r", band: "0–10", sealed: false });
  expect(ctx.rows[0]).toMatchObject({ stairCount: 1, stairLinks: "\u2194 f1", openingCount: 0 });
  expect(f1.targets.map((t) => t.id)).toEqual(["r", "b"]);
  expect(ctx.rows[0].band).toBe("10–∞");
  expect(ctx.rows[2].sealed).toBe(true);
  expect(ctx.issues[0].fixable).toBe(true);
  expect(ctx.issues[0].key).toBe("surface-missing:b:");
  expect(ctx.journalSize).toBe(2);
});

test("issueKey handles a present docId", () => {
  expect(issueKey({ id: "x", levelId: "l", docId: "d" })).toBe("x:l:d");
});

test("band label prints infinities for live docs", () => {
  const plan = buildFloorPlan({ levels: [L("b", -Infinity, 0, ["b"], "basement"), L("r", 10, Infinity, ["r"], "roof")], regions: [] });
  const ctx = panelContext(plan, { activeLevelId: null, issues: [], intent: null, journalSize: 0, isolationEnabled: false });
  expect(ctx.rows.map((r) => r.band)).toEqual(["10–∞", "-∞–0"]);
});

test("panelContext resolves the armed intent level name", () => {
  const plan = buildFloorPlan({ levels: [{ ...L("f1", 0, 10, ["f1"]), name: "Ground" }], regions: [] });
  const ctx = panelContext(plan, { activeLevelId: null, issues: [], intent: { kind: "hole", levelId: "f1", tool: "rectangle" }, journalSize: 0, isolationEnabled: false });
  expect(ctx.intent.levelName).toBe("Ground");
  const gone = panelContext(plan, { activeLevelId: null, issues: [], intent: { kind: "hole", levelId: "zz", tool: "rectangle" }, journalSize: 0, isolationEnabled: false });
  expect(gone.intent.levelName).toBe("zz");
});

test("panelContext groups issues per row and counts them", () => {
  const plan = buildFloorPlan({ levels: [L("b", -10, 0, ["b"], "basement"), L("f1", 0, 10, ["f1"]), L("f2", 10, 20, ["f2"])], regions: [] });
  const issues = [
    { id: "surface-missing", label: "a", levelId: "b", docId: null, fix: { intent: "footprint", levelId: "b" } },
    { id: "surface-band", label: "b", levelId: "f1", docId: "s1", fix: { collection: "regions", op: "update", data: {} } },
    { id: "level-overlap", label: "c", levelId: "f1", docId: "f2", fix: null },
  ];
  const ctx = panelContext(plan, { activeLevelId: "f1", issues, intent: null, journalSize: 0, isolationEnabled: true });
  expect(ctx.rows.map((r) => r.issues.length)).toEqual([0, 2, 1]);
  expect(ctx.rows[1].issues.map((i) => i.key)).toEqual(["surface-band:f1:s1", "level-overlap:f1:f2"]);
  expect(ctx.rows[1].issues.map((i) => i.fixable)).toEqual([true, false]);
  expect(ctx.issueCount).toBe(3);
  expect(ctx.autoFixCount).toBe(1);
});

test("panelContext default stair target is the level above, else below", () => {
  const plan = buildFloorPlan({ levels: [L("b", -10, 0, ["b"], "basement"), L("f1", 0, 10, ["f1"]), L("f2", 10, 20, ["f2"])], regions: [] });
  const ctx = panelContext(plan, { activeLevelId: null, issues: [], intent: null, journalSize: 0, isolationEnabled: true });
  const byId = Object.fromEntries(ctx.rows.map((r) => [r.id, r]));
  expect(byId.b.defaultTargetId).toBe("f1");
  expect(byId.f1.defaultTargetId).toBe("f2");
  expect(byId.f2.defaultTargetId).toBe("f1");
  expect(byId.f1.targets.map((t) => ({ ...t }))).toEqual([{ id: "f2", name: "f2", selected: true }, { id: "b", name: "b", selected: false }]);
  const single = panelContext(buildFloorPlan({ levels: [L("f1", 0, 10, ["f1"])], regions: [] }), { activeLevelId: null, issues: [], intent: null, journalSize: 0, isolationEnabled: true });
  expect(single.rows[0].defaultTargetId).toBeNull();
});

test("panelContext collapses level-overlap issues into one chip naming the other levels", () => {
  const plan = buildFloorPlan({ levels: [{ ...L("f1", 0, 20, ["f1"]), name: "Ground" }, { ...L("f2", 10, 30, ["f2"]), name: "L1" }, { ...L("r", 15, null, ["r"], "roof"), name: "Roof" }], regions: [] });
  const issues = [
    { id: "level-overlap", label: "FLOORER.Issue.level-overlap", levelId: "f1", docId: "f2", fix: null },
    { id: "level-overlap", label: "FLOORER.Issue.level-overlap", levelId: "f1", docId: "r", fix: null },
    { id: "level-overlap", label: "FLOORER.Issue.level-overlap", levelId: "f1", docId: "gone", fix: null },
    { id: "surface-missing", label: "FLOORER.Issue.surface-missing", levelId: "f1", docId: null, fix: { intent: "footprint", levelId: "f1" } },
  ];
  const ctx = panelContext(plan, { activeLevelId: null, issues, intent: null, journalSize: 0, isolationEnabled: false });
  const f1 = ctx.rows.find((r) => r.id === "f1");
  expect(f1.issues).toHaveLength(2);
  expect(f1.issues[0].key).toBe("surface-missing:f1:");
  expect(f1.issues[1]).toMatchObject({ key: "level-overlap:f1:f2", label: "FLOORER.Issue.level-overlap-with", levels: "L1, Roof, gone", fixable: false });
  expect(ctx.issueCount).toBe(4);
});

test("panelContext stair count includes owned and arriving stairs", () => {
  const plan = buildFloorPlan({ levels: [{ ...L("b", -10, 0, ["b"], "basement"), name: "B1" }, { ...L("f1", 0, 10, ["f1"]), name: "Ground" }, { ...L("f2", 10, 20, ["f2"]), name: "L2" }], regions: [
    { id: "s1", flags: { floorer: { role: "stair", levelId: "f1", targetLevelId: "f2", managed: true } } },
    { id: "s2", flags: { floorer: { role: "stair", levelId: "b", targetLevelId: "f1", managed: true } } },
  ] });
  const ctx = panelContext(plan, { activeLevelId: null, issues: [], intent: null, journalSize: 0, isolationEnabled: false });
  const byId = Object.fromEntries(ctx.rows.map((r) => [r.id, r]));
  expect(byId.f1).toMatchObject({ stairCount: 2, stairLinks: "\u2194 L2, \u2194 B1" });
  expect(byId.f2).toMatchObject({ stairCount: 1, stairLinks: "\u2194 Ground" });
  expect(byId.b).toMatchObject({ stairCount: 1, stairLinks: "\u2194 Ground" });
});
