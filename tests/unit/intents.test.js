import { intents } from "../../scripts/canvas/intents.js";
import { journal } from "../../scripts/journal/journal.js";

const rect = { type: "rectangle", x: 0, y: 0, width: 10, height: 10, rotation: 0, hole: false };
const L = (id, bottom, top, vis) => ({ id, _id: id, name: id, elevation: { bottom, top }, visibility: { levels: new Set(vis) }, flags: { floorer: { role: "level", managed: true } } });
const S = (id, levelId) => ({ id, _id: id, shapes: [rect], flags: { floorer: { role: "surface", levelId, holes: [], managed: true } }, levels: new Set([levelId]), elevation: { bottom: 0, top: 10 } });

function scene(levels, regions) {
  const s = {
    id: "s",
    levels: { get: (id) => levels.find((l) => l.id === id), [Symbol.iterator]: () => levels[Symbol.iterator]() },
    regions: { get: (id) => regions.find((r) => r.id === id), [Symbol.iterator]: () => regions[Symbol.iterator]() },
    updateEmbeddedDocuments: jest.fn(async (_n, data) => data.map((d) => ({ id: d._id }))),
    createEmbeddedDocuments: jest.fn(async () => []),
    deleteEmbeddedDocuments: jest.fn(async () => []),
  };
  canvas.scene = s;
  return s;
}

beforeEach(() => {
  intents.clear();
  journal.clear();
  canvas.regions = { activate: jest.fn() };
  game.settings.set("floorer", "mirrorHoles", true);
});

test("arm stores intent and activates tool", () => {
  intents.arm({ kind: "footprint", levelId: "f1", tool: "polygon" });
  expect(intents.current.kind).toBe("footprint");
  expect(canvas.regions.activate).toHaveBeenCalledWith({ tool: "polygon" });
});

test("footprint adoption rewrites create data and clears", () => {
  const f1 = L("f1", 0, 10, ["f1", "f2"]);
  const f2 = L("f2", 10, 20, ["f1", "f2"]);
  scene([f1, f2], []);
  intents.arm({ kind: "footprint", levelId: "f1", tool: "polygon" });
  const doc = { updateSource: jest.fn() };
  const ok = intents.onPreCreateRegion(doc, { shapes: [rect], levels: ["f1"] }, {}, "gm1");
  expect(ok).not.toBe(false);
  const src = doc.updateSource.mock.calls[0][0];
  expect(src.levels.sort()).toEqual(["f1", "f2"]);
  expect(src.behaviors[0].type).toBe("defineSurface");
  expect(src.flags.floorer.role).toBe("surface");
  expect(intents.current).toBeNull();
});

test("ignores other users and no intent", () => {
  const doc = { updateSource: jest.fn() };
  expect(intents.onPreCreateRegion(doc, { shapes: [rect] }, {}, "gm1")).toBeUndefined();
  intents.arm({ kind: "footprint", levelId: "f1", tool: "polygon" });
  expect(intents.onPreCreateRegion(doc, { shapes: [rect] }, {}, "other")).toBeUndefined();
  expect(doc.updateSource).not.toHaveBeenCalled();
});

test("hole adoption cancels creation and updates surfaces", async () => {
  const b = L("b", -10, 0, ["b"]);
  const f1 = L("f1", 0, 10, ["f1"]);
  const s = scene([b, f1], [S("sb", "b"), S("s1", "f1")]);
  intents.arm({ kind: "hole", levelId: "f1", tool: "rectangle" });
  const result = intents.onPreCreateRegion({ updateSource: jest.fn() }, { shapes: [rect] }, {}, "gm1");
  expect(result).toBe(false);
  await new Promise((r) => setTimeout(r, 0));
  const updates = s.updateEmbeddedDocuments.mock.calls[0][1];
  expect(updates.map((u) => u._id)).toEqual(["s1", "sb"]);
  expect(updates[0].shapes[1].hole).toBe(true);
  expect(journal.size).toBe(1);
});

test("hole adoption without surface warns and cancels", () => {
  scene([L("f1", 0, 10, ["f1"])], []);
  intents.arm({ kind: "hole", levelId: "f1", tool: "rectangle" });
  expect(intents.onPreCreateRegion({ updateSource: jest.fn() }, { shapes: [rect] }, {}, "gm1")).toBe(false);
  expect(ui.notifications.warn).toHaveBeenCalled();
});

test("stair adoption uses lower band and mirrors on create", async () => {
  const f1 = L("f1", 0, 10, ["f1", "f2"]);
  const f2 = L("f2", 10, 20, ["f1", "f2"]);
  const s = scene([f1, f2], [S("s1", "f1"), { ...S("s2", "f2"), elevation: { bottom: 10, top: 20 } }]);
  intents.arm({ kind: "stair", levelId: "f2", targetLevelId: "f1", tool: "rectangle" });
  const doc = { updateSource: jest.fn() };
  intents.onPreCreateRegion(doc, { shapes: [rect] }, {}, "gm1");
  const src = doc.updateSource.mock.calls[0][0];
  expect(src.elevation).toEqual({ bottom: 0, top: 10 });
  expect(src.levels).toEqual(["f1", "f2"]);
  expect(src.behaviors[0].type).toBe("changeLevel");
  const created = { id: "st", shapes: [rect], flags: { floorer: src.flags.floorer } };
  await intents.onCreateRegion(created, {}, "gm1");
  const updates = s.updateEmbeddedDocuments.mock.calls[0][1];
  expect(updates.map((u) => u._id).sort()).toEqual(["s1", "s2"]);
});

test("stair mirror skipped when setting off", async () => {
  game.settings.set("floorer", "mirrorHoles", false);
  const f1 = L("f1", 0, 10, ["f1"]);
  const f2 = L("f2", 10, 20, ["f2"]);
  const s = scene([f1, f2], [S("s1", "f1")]);
  const created = { id: "st", shapes: [rect], flags: { floorer: { role: "stair", levelId: "f1", targetLevelId: "f2", managed: true } } };
  await intents.onCreateRegion(created, {}, "gm1");
  expect(s.updateEmbeddedDocuments).not.toHaveBeenCalled();
});
