import { bandsFor, levelName, generateLevelData, visibilityFor } from "../../scripts/model/levels.js";

const base = { floorsAbove: 2, basements: 1, roof: true, floorHeight: 10, groundBottom: 0 };

test("bandsFor orders basement, floors, roof", () => {
  const bands = bandsFor(base);
  expect(bands.map((b) => [b.kind, b.bottom, b.top])).toEqual([
    ["basement", -10, 0],
    ["floor", 0, 10],
    ["floor", 10, 20],
    ["roof", 20, null],
  ]);
});

test("bandsFor two basements count down", () => {
  const bands = bandsFor({ ...base, basements: 2, roof: false });
  expect(bands.slice(0, 2).map((b) => [b.index, b.bottom, b.top])).toEqual([
    [2, -20, -10],
    [1, -10, 0],
  ]);
});

test("levelName formats", () => {
  expect(levelName({ kind: "floor", index: 2, bottom: 10, top: 20 })).toBe("L2");
  expect(levelName({ kind: "basement", index: 1, bottom: -10, top: 0 })).toBe("B1");
  expect(levelName({ kind: "roof", index: 0, bottom: 20, top: null })).toBe("Roof");
});

test("generateLevelData assigns images bottom→top and flags", () => {
  const data = generateLevelData({ ...base, images: ["b1.webp", "l1.webp", "l2.webp"] });
  expect(data).toHaveLength(4);
  expect(data[0].background.src).toBe("b1.webp");
  expect(data[3].background).toBeUndefined();
  expect(data[1]).toMatchObject({
    name: "L1",
    elevation: { bottom: 0, top: 10 },
    sort: 1,
    flags: { floorer: { role: "level", kind: "floor", managed: true, v: 1 } },
  });
});

test("visibilityFor seals basements", () => {
  const levels = [
    { _id: "b", flags: { floorer: { kind: "basement" } } },
    { _id: "f1", flags: { floorer: { kind: "floor" } } },
    { _id: "f2", flags: { floorer: { kind: "floor" } } },
    { _id: "r", flags: { floorer: { kind: "roof" } } },
  ];
  const upd = visibilityFor(levels, { sealBasements: true });
  expect(upd.find((u) => u._id === "b")["visibility.levels"]).toEqual(["b"]);
  expect(upd.find((u) => u._id === "f1")["visibility.levels"].sort()).toEqual(["f1", "f2", "r"]);
});

test("visibilityFor unsealed basements see everything above ground", () => {
  const levels = [
    { _id: "b", flags: { floorer: { kind: "basement" } } },
    { _id: "f1", flags: { floorer: { kind: "floor" } } },
  ];
  const upd = visibilityFor(levels, { sealBasements: false });
  expect(upd.find((u) => u._id === "b")["visibility.levels"].sort()).toEqual(["b", "f1"]);
  expect(upd.find((u) => u._id === "f1")["visibility.levels"].sort()).toEqual(["b", "f1"]);
});
