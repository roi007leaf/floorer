import { buildOutlineWalls, removeOutlineWalls } from "../../scripts/ui/panel-actions.js";
import { journal } from "../../scripts/journal/journal.js";

const rect = { type: "rectangle", x: 0, y: 0, width: 10, height: 10, rotation: 0, hole: false };
const wall = (id, levelId) => ({ id, toObject: () => ({ _id: id, c: [0, 0, 1, 1] }), flags: { floorer: { role: "outlineWall", levelId, managed: true } } });

function sceneWith(walls) {
  let next = 0;
  return {
    id: "s1",
    walls,
    createEmbeddedDocuments: jest.fn(async (_name, data) => data.map((d) => ({ id: `n${next++}`, ...d }))),
    deleteEmbeddedDocuments: jest.fn(async () => []),
  };
}

beforeEach(() => journal.clear());

test("buildOutlineWalls replaces this level's outline walls and journals both steps", async () => {
  const scene = sceneWith([wall("a", "f1"), wall("b", "f2")]);
  const count = await buildOutlineWalls(scene, { level: { id: "f1" }, surface: { shapes: [rect] } });
  expect(count).toBe(4);
  expect(scene.deleteEmbeddedDocuments).toHaveBeenCalledWith("Wall", ["a"]);
  const created = scene.createEmbeddedDocuments.mock.calls[0][1];
  expect(created).toHaveLength(4);
  expect(created[0]).toMatchObject({ c: [0, 0, 10, 0], levels: ["f1"], flags: { floorer: { role: "outlineWall", levelId: "f1" } } });
  expect(journal.size).toBe(2);
});

test("buildOutlineWalls does nothing without a surface", async () => {
  const scene = sceneWith([wall("a", "f1")]);
  expect(await buildOutlineWalls(scene, { level: { id: "f1" }, surface: null })).toBe(0);
  expect(scene.deleteEmbeddedDocuments).not.toHaveBeenCalled();
  expect(journal.size).toBe(0);
});

test("removeOutlineWalls deletes only this level's outline walls with a journaled before", async () => {
  const scene = sceneWith([wall("a", "f1"), wall("b", "f2"), { id: "c", flags: {} }]);
  expect(await removeOutlineWalls(scene, { level: { id: "f1" } })).toBe(1);
  expect(scene.deleteEmbeddedDocuments).toHaveBeenCalledWith("Wall", ["a"]);
  expect(journal.size).toBe(1);
  expect(await removeOutlineWalls(scene, { level: { id: "f3" } })).toBe(0);
  expect(journal.size).toBe(1);
});
