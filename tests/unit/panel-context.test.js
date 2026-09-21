import { issueKey, panelContext } from "../../scripts/ui/panel-actions.js";
import { buildFloorPlan } from "../../scripts/model/floor-plan.js";

const L = (id, bottom, top, vis, kind = "floor") => ({ id, _id: id, name: id, elevation: { bottom, top }, visibility: { levels: new Set(vis) }, flags: { floorer: { role: "level", kind, managed: true } } });

test("panelContext rows", () => {
  const plan = buildFloorPlan({ levels: [L("b", -10, 0, ["b"], "basement"), L("f1", 0, 10, ["f1", "r"]), L("r", 10, null, ["f1", "r"], "roof")], regions: [
    { id: "s", flags: { floorer: { role: "surface", levelId: "f1", holes: [{ id: "h" }], managed: true } } },
    { id: "st", flags: { floorer: { role: "stair", levelId: "f1", targetLevelId: "r", managed: true } } },
  ] });
  const ctx = panelContext(plan, { activeLevelId: "f1", issues: [{ id: "surface-missing", label: "x", levelId: "b", fix: { intent: "footprint", levelId: "b" } }], intent: null, journalSize: 2, isolationEnabled: true });
  expect(ctx.rows.map((r) => r.id)).toEqual(["r", "f1", "b"]);
  const f1 = ctx.rows[1];
  expect(f1).toMatchObject({ active: true, hasSurface: true, holeCount: 1, stairCount: 1, band: "0–10", sealed: false });
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
