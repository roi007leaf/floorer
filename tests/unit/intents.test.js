import { intents } from "../../scripts/canvas/intents.js";
import { journal } from "../../scripts/journal/journal.js";
import { lint } from "../../scripts/model/issues.js";
import { buildFloorPlan } from "../../scripts/model/floor-plan.js";
import { STAIR_PALETTE } from "../../scripts/model/regions.js";
import { padShape, STAIR_OPENING_PAD } from "../../scripts/model/shapes.js";

const rect = { type: "rectangle", x: 0, y: 0, width: 10, height: 10, rotation: 0, hole: false };
const L = (id, bottom, top, vis) => ({ id, _id: id, name: id, elevation: { bottom, top }, visibility: { levels: new Set(vis) }, flags: { floorer: { role: "level", managed: true } } });
const S = (id, levelId) => ({ id, _id: id, shapes: [rect], flags: { floorer: { role: "surface", levelId, holes: [], managed: true } }, levels: new Set([levelId]), elevation: { bottom: 0, top: 10 } });

function scene(levels, regions) {
  const s = {
    id: "s",
    levels: { get: (id) => levels.find((l) => l.id === id), [Symbol.iterator]: () => levels[Symbol.iterator]() },
    regions: { get: (id) => regions.find((r) => r.id === id), filter: (fn) => regions.filter(fn), [Symbol.iterator]: () => regions[Symbol.iterator]() },
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
  canvas.regions = { activate: jest.fn(), releaseAll: jest.fn(), placeables: [] };
  ui.controls = { control: { name: "regions" }, tool: { name: "polygon" } };
  game.settings.set("floorer", "mirrorHoles", true);
});

test("arm survives the scene-controls hook fired by its own tool activation", () => {
  canvas.regions.activate = jest.fn(() => intents.onSceneControls());
  intents.arm({ kind: "footprint", levelId: "f1", tool: "polygon" });
  expect(intents.current?.kind).toBe("footprint");
});

test("onSceneControls keeps the intent while the armed tool stays active", () => {
  intents.arm({ kind: "footprint", levelId: "f1", tool: "polygon" });
  intents.onSceneControls();
  expect(intents.current?.kind).toBe("footprint");
});

test("onSceneControls clears the intent when the user switches tool or layer", () => {
  intents.arm({ kind: "footprint", levelId: "f1", tool: "polygon" });
  ui.controls.tool = { name: "select" };
  intents.onSceneControls();
  expect(intents.current).toBeNull();
  intents.arm({ kind: "footprint", levelId: "f1", tool: "polygon" });
  ui.controls = { control: { name: "walls" }, tool: { name: "polygon" } };
  intents.onSceneControls();
  expect(intents.current).toBeNull();
});

test("arm releases controlled regions and closes open region sheets", () => {
  const openSheet = { rendered: true, close: jest.fn() };
  const closedSheet = { rendered: false, close: jest.fn() };
  canvas.regions.placeables = [{ sheet: openSheet }, { sheet: closedSheet }, {}];
  intents.arm({ kind: "hole", levelId: "f1", tool: "rectangle" });
  expect(canvas.regions.releaseAll).toHaveBeenCalled();
  expect(openSheet.close).toHaveBeenCalled();
  expect(closedSheet.close).not.toHaveBeenCalled();
});

test("arm stores intent and activates tool", () => {
  intents.arm({ kind: "footprint", levelId: "f1", tool: "polygon" });
  expect(intents.current.kind).toBe("footprint");
  expect(canvas.regions.activate).toHaveBeenCalledWith({ tool: "polygon" });
});

test("arm notifies with resolved level name", () => {
  canvas.scene = { levels: { get: () => ({ name: "Ground" }) } };
  intents.arm({ kind: "footprint", levelId: "f1", tool: "polygon" });
  expect(ui.notifications.info).toHaveBeenCalledWith(expect.stringContaining("Ground"));
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

test("hole adoption surfaces error when write fails", async () => {
  const b = L("b", -10, 0, ["b"]);
  const f1 = L("f1", 0, 10, ["f1"]);
  const s = scene([b, f1], [S("sb", "b"), S("s1", "f1")]);
  s.updateEmbeddedDocuments = jest.fn(async () => {
    throw new Error("boom");
  });
  intents.arm({ kind: "hole", levelId: "f1", tool: "rectangle" });
  intents.onPreCreateRegion({ updateSource: jest.fn() }, { shapes: [rect] }, {}, "gm1");
  await new Promise((r) => setTimeout(r, 0));
  expect(ui.notifications.error).toHaveBeenCalled();
});

test("hole adoption without surface warns and cancels", () => {
  scene([L("f1", 0, 10, ["f1"])], []);
  intents.arm({ kind: "hole", levelId: "f1", tool: "rectangle" });
  expect(intents.onPreCreateRegion({ updateSource: jest.fn() }, { shapes: [rect] }, {}, "gm1")).toBe(false);
  expect(ui.notifications.warn).toHaveBeenCalled();
});

test("stair adoption spans the climb and mirrors on create", async () => {
  const f1 = L("f1", 0, 10, ["f1", "f2"]);
  const f2 = L("f2", 10, 20, ["f1", "f2"]);
  const s = scene([f1, f2], [S("s1", "f1"), { ...S("s2", "f2"), elevation: { bottom: 10, top: 20 } }]);
  intents.arm({ kind: "stair", levelId: "f2", targetLevelId: "f1", tool: "rectangle" });
  const doc = { updateSource: jest.fn() };
  intents.onPreCreateRegion(doc, { shapes: [rect] }, {}, "gm1");
  const src = doc.updateSource.mock.calls[0][0];
  expect(src.elevation).toEqual({ bottom: 0, top: 20, topInclusive: true });
  expect(src.levels).toEqual(["f1", "f2"]);
  expect(src.flags.floorer.stops).toEqual([]);
  expect(src.behaviors[0].type).toBe("changeLevel");
  expect(src.flags.floorer.index).toBe(0);
  expect(src.color).toBe(STAIR_PALETTE[0]);
  const created = { id: "st", shapes: [rect], flags: { floorer: src.flags.floorer } };
  await intents.onCreateRegion(created, {}, "gm1");
  const updates = s.updateEmbeddedDocuments.mock.calls[0][1];
  expect(updates.map((u) => u._id).sort()).toEqual(["s1", "s2"]);
});

test("stair index counts the stairs already in the scene", () => {
  const f1 = L("f1", 0, 10, ["f1"]);
  const f2 = L("f2", 10, 20, ["f2"]);
  const existing = (id) => ({ id, _id: id, shapes: [rect], flags: { floorer: { role: "stair", levelId: "f1", targetLevelId: "f2", managed: true } } });
  scene([f1, f2], [S("s1", "f1"), existing("a"), existing("b")]);
  intents.arm({ kind: "stair", levelId: "f1", targetLevelId: "f2", tool: "rectangle" });
  const doc = { updateSource: jest.fn() };
  intents.onPreCreateRegion(doc, { shapes: [rect] }, {}, "gm1");
  const src = doc.updateSource.mock.calls[0][0];
  expect(src.flags.floorer.index).toBe(2);
  expect(src.color).toBe(STAIR_PALETTE[2]);
});

test("stair mirror links the lower hole to the upper hole so lint is clean", async () => {
  const f1 = L("f1", 0, 10, ["f1", "f2"]);
  const f2 = L("f2", 10, 20, ["f1", "f2"]);
  const s1 = { ...S("s1", "f1"), levels: new Set(["f1", "f2"]), elevation: { bottom: 0, top: 10, topInclusive: true } };
  const s2 = { ...S("s2", "f2"), levels: new Set(["f1", "f2"]), elevation: { bottom: 10, top: 20, topInclusive: true } };
  const s = scene([f1, f2], [s1, s2]);
  const created = { id: "st", shapes: [rect], flags: { floorer: { role: "stair", levelId: "f1", targetLevelId: "f2", managed: true } } };
  await intents.onCreateRegion(created, {}, "gm1");
  const updates = s.updateEmbeddedDocuments.mock.calls[0][1];
  const upper = updates.find((u) => u._id === "s2");
  const lower = updates.find((u) => u._id === "s1");
  expect(upper["flags.floorer.holes"][0].mirrorOf).toBeUndefined();
  expect(lower["flags.floorer.holes"][0].mirrorOf).toBe(upper["flags.floorer.holes"][0].id);
  for (const u of updates) {
    const doc = u._id === "s1" ? s1 : s2;
    doc.shapes = u.shapes;
    doc.flags.floorer.holes = u["flags.floorer.holes"];
  }
  expect(lint(buildFloorPlan({ levels: [f1, f2], regions: [s1, s2] }))).toEqual([]);
});

test("stair with only the lower surface appends there without mirrorOf", async () => {
  const f1 = L("f1", 0, 10, ["f1"]);
  const f2 = L("f2", 10, 20, ["f2"]);
  const s = scene([f1, f2], [S("s1", "f1")]);
  const created = { id: "st", shapes: [rect], flags: { floorer: { role: "stair", levelId: "f1", targetLevelId: "f2", managed: true } } };
  await intents.onCreateRegion(created, {}, "gm1");
  const updates = s.updateEmbeddedDocuments.mock.calls[0][1];
  expect(updates.map((u) => u._id)).toEqual(["s1"]);
  expect(updates[0]["flags.floorer.holes"][0].mirrorOf).toBeUndefined();
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

test("a stair drawn across three levels becomes a shaft with a stop and openings in every floor", async () => {
  const f1 = L("f1", 0, 10, ["f1", "f2", "f3"]);
  const f2 = L("f2", 10, 20, ["f1", "f2", "f3"]);
  const f3 = L("f3", 20, 30, ["f1", "f2", "f3"]);
  const s1 = { ...S("s1", "f1"), elevation: { bottom: 0, top: 10, topInclusive: true } };
  const s2 = { ...S("s2", "f2"), elevation: { bottom: 10, top: 20, topInclusive: true } };
  const s3 = { ...S("s3", "f3"), elevation: { bottom: 20, top: 30, topInclusive: true } };
  const s = scene([f1, f2, f3], [s1, s2, s3]);
  intents.arm({ kind: "stair", levelId: "f1", targetLevelId: "f3", tool: "rectangle" });
  const doc = { updateSource: jest.fn() };
  intents.onPreCreateRegion(doc, { shapes: [rect] }, {}, "gm1");
  const src = doc.updateSource.mock.calls[0][0];
  expect(src.elevation).toEqual({ bottom: 0, top: 30, topInclusive: true });
  expect(src.levels).toEqual(["f1", "f2", "f3"]);
  expect(src.flags.floorer.stops).toEqual(["f2"]);
  const created = { id: "st", shapes: [rect], flags: { floorer: src.flags.floorer } };
  await intents.onCreateRegion(created, {}, "gm1");
  const updates = s.updateEmbeddedDocuments.mock.calls[0][1];
  expect(updates.map((u) => u._id)).toEqual(["s3", "s2", "s1"]);
  const origin = updates[0]["flags.floorer.holes"][0];
  expect(origin.mirrorOf).toBeUndefined();
  expect(updates.slice(1).every((u) => u["flags.floorer.holes"][0].mirrorOf === origin.id)).toBe(true);
});

test("stair drawn as a polygon mirrors the polygon opening into both surfaces", async () => {
  const f1 = L("f1", 0, 10, ["f1", "f2"]);
  const f2 = L("f2", 10, 20, ["f1", "f2"]);
  const s = scene([f1, f2], [S("s1", "f1"), { ...S("s2", "f2"), elevation: { bottom: 10, top: 20 } }]);
  const polygon = { type: "polygon", points: [0, 0, 10, 0, 10, 10], hole: false };
  const created = { id: "st", shapes: [polygon], flags: { floorer: { role: "stair", levelId: "f1", targetLevelId: "f2", managed: true } } };
  await intents.onCreateRegion(created, {}, "gm1");
  const updates = s.updateEmbeddedDocuments.mock.calls[0][1];
  for (const u of updates) {
    expect(u.shapes.at(-1)).toEqual({ ...padShape(polygon, STAIR_OPENING_PAD), hole: true });
    expect(u["flags.floorer.holes"].at(-1).stairId).toBe("st");
  }
});

function wallScene(walls) {
  const s = {
    id: "s",
    levels: { get: () => null },
    regions: { get: () => null, filter: () => [], [Symbol.iterator]: () => [][Symbol.iterator]() },
    walls,
    createEmbeddedDocuments: jest.fn(async (_n, data) => data.map((d, i) => ({ id: `n${i}`, ...d }))),
    deleteEmbeddedDocuments: jest.fn(async () => []),
  };
  canvas.scene = s;
  canvas.grid = { size: 100 };
  canvas.stage = {};
  canvas.walls = { activate: jest.fn() };
  return s;
}

const W = (id, c, object = {}) => ({ id, c, object, toObject: () => ({ _id: id, c, levels: ["f1"], move: 20, sight: 20, light: 20, sound: 20, door: 0, ds: 0, flags: { floorer: { role: "outlineWall", levelId: "f1" } } }) });
const click = (x, y, button = 0) => ({ button, getLocalPosition: () => ({ x, y }) });

test("arming a door intent activates the walls select tool and survives its scene-controls hook", () => {
  wallScene([]);
  canvas.walls.activate = jest.fn(() => intents.onSceneControls());
  intents.arm({ kind: "door", levelId: "f1", tool: "select" });
  expect(canvas.walls.activate).toHaveBeenCalledWith({ tool: "select" });
  expect(intents.current?.kind).toBe("door");
  ui.controls = { control: { name: "walls" }, tool: { name: "select" } };
  intents.onSceneControls();
  expect(intents.current?.kind).toBe("door");
  ui.controls = { control: { name: "regions" }, tool: { name: "select" } };
  intents.onSceneControls();
  expect(intents.current).toBeNull();
});

test("bindStage registers the pointer listener once, and again after listeners were stripped", () => {
  const bound = [];
  const stage = { on: jest.fn((_n, fn) => bound.push(fn)), listeners: () => bound };
  intents.bindStage(stage);
  intents.bindStage(stage);
  expect(stage.on).toHaveBeenCalledTimes(1);
  expect(stage.on.mock.calls[0][0]).toBe("pointerdown");
  bound.length = 0;
  intents.bindStage(stage);
  expect(stage.on).toHaveBeenCalledTimes(2);
});

test("clicking near a drawn wall with a door intent replaces it with door pieces", async () => {
  const s = wallScene([W("a", [0, 0, 400, 0]), W("hidden", [0, 30, 400, 30], null)]);
  intents.arm({ kind: "door", levelId: "f1", tool: "select" });
  intents.onStagePointerDown(click(200, 20));
  expect(intents.current).toBeNull();
  await new Promise((r) => setTimeout(r, 0));
  expect(s.deleteEmbeddedDocuments).toHaveBeenCalledWith("Wall", ["a"]);
  const created = s.createEmbeddedDocuments.mock.calls[0][1];
  expect(created.map((w) => w.c)).toEqual([
    [0, 0, 150, 0],
    [150, 0, 250, 0],
    [250, 0, 400, 0],
  ]);
  expect(created[1]).toMatchObject({ door: 1, ds: 0, levels: ["f1"] });
  expect(created[0].door).toBe(0);
  expect(journal.size).toBe(2);
  expect(ui.notifications.info).toHaveBeenCalledWith(expect.stringContaining("Cut.door"));
});

test("window intent opens sight and light on the middle piece while keeping movement blocked", async () => {
  const s = wallScene([W("a", [0, 0, 400, 0])]);
  intents.arm({ kind: "window", levelId: "f1", tool: "select" });
  intents.onStagePointerDown(click(100, 0));
  await new Promise((r) => setTimeout(r, 0));
  const created = s.createEmbeddedDocuments.mock.calls[0][1];
  expect(created[1]).toMatchObject({ door: 0, move: 20, sight: 0, light: 0, sound: 0 });
  expect(created[0]).toMatchObject({ sight: 20, light: 20 });
});

test("door intent warns and stays armed when no wall is near, ignores other buttons, cancels on right click", () => {
  const s = wallScene([W("a", [0, 0, 400, 0])]);
  intents.arm({ kind: "door", levelId: "f1", tool: "select" });
  intents.onStagePointerDown(click(200, 300));
  expect(ui.notifications.warn).toHaveBeenCalledWith(expect.stringContaining("NoWall"));
  expect(intents.current?.kind).toBe("door");
  intents.onStagePointerDown(click(200, 0, 1));
  expect(s.deleteEmbeddedDocuments).not.toHaveBeenCalled();
  intents.onStagePointerDown(click(200, 0, 2));
  expect(intents.current).toBeNull();
  intents.onStagePointerDown(click(200, 0));
  expect(s.deleteEmbeddedDocuments).not.toHaveBeenCalled();
});

test("pointer clicks are ignored while a drawing intent is armed", () => {
  const s = wallScene([W("a", [0, 0, 400, 0])]);
  intents.arm({ kind: "footprint", levelId: "f1", tool: "polygon" });
  intents.onStagePointerDown(click(200, 0));
  expect(s.deleteEmbeddedDocuments).not.toHaveBeenCalled();
  expect(intents.current?.kind).toBe("footprint");
});
