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
