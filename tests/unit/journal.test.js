import { journal } from "../../scripts/journal/journal.js";

function mockScene(id = "s1") {
  return {
    id,
    createEmbeddedDocuments: jest.fn(async (_n, data) => data.map((d, i) => ({ id: d._id ?? `new${i}`, toObject: () => ({ _id: d._id ?? `new${i}`, ...d }) }))),
    updateEmbeddedDocuments: jest.fn(async (_n, data) => data.map((d) => ({ id: d._id }))),
    deleteEmbeddedDocuments: jest.fn(async (_n, ids) => ids.map((id) => ({ id }))),
  };
}

beforeEach(() => journal.clear());

test("run create records ids and undo deletes them", async () => {
  const scene = mockScene();
  const docs = await journal.run({ op: "create", collection: "regions", scene }, () => scene.createEmbeddedDocuments("Region", [{ name: "a" }]));
  expect(docs[0].id).toBe("new0");
  expect(journal.size).toBe(1);
  await journal.undo();
  expect(scene.deleteEmbeddedDocuments).toHaveBeenCalledWith("Region", ["new0"], { floorerJournal: true });
  expect(journal.size).toBe(0);
});

test("run update restores before", async () => {
  const scene = mockScene();
  const before = [{ _id: "r1", name: "old" }];
  await journal.run({ op: "update", collection: "regions", scene, before }, () => scene.updateEmbeddedDocuments("Region", [{ _id: "r1", name: "new" }]));
  await journal.undo();
  expect(scene.updateEmbeddedDocuments).toHaveBeenLastCalledWith("Region", before, { floorerJournal: true });
});

test("run delete recreates before", async () => {
  const scene = mockScene();
  const before = [{ _id: "l1", name: "L1" }];
  await journal.run({ op: "delete", collection: "levels", scene, before }, () => scene.deleteEmbeddedDocuments("Level", ["l1"]));
  await journal.undo();
  expect(scene.createEmbeddedDocuments).toHaveBeenLastCalledWith("Level", before, { floorerJournal: true, keepId: true });
});

test("revert undoes all in reverse order", async () => {
  const scene = mockScene();
  const calls = [];
  scene.deleteEmbeddedDocuments = jest.fn(async (_n, ids) => { calls.push(ids[0]); return []; });
  await journal.run({ op: "create", collection: "regions", scene }, async () => [{ id: "a" }]);
  await journal.run({ op: "create", collection: "regions", scene }, async () => [{ id: "b" }]);
  const n = await journal.revert();
  expect(n).toBe(2);
  expect(calls).toEqual(["b", "a"]);
});

test("failed fn does not record", async () => {
  const scene = mockScene();
  await expect(journal.run({ op: "create", collection: "regions", scene }, async () => { throw new Error("x"); })).rejects.toThrow("x");
  expect(journal.size).toBe(0);
});

test("scene change clears", async () => {
  await journal.run({ op: "create", collection: "regions", scene: mockScene("a") }, async () => [{ id: "1" }]);
  await journal.run({ op: "create", collection: "regions", scene: mockScene("b") }, async () => [{ id: "2" }]);
  expect(journal.size).toBe(1);
  expect(journal.sceneId).toBe("b");
});

test("undo on empty returns false", async () => {
  expect(await journal.undo()).toBe(false);
});
