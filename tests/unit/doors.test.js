import { distanceToWall, doorPiece, nearestWall, splitWallAt, windowPiece } from "../../scripts/model/doors.js";

const source = { _id: "w1", c: [0, 0, 300, 0], levels: ["f1"], move: 20, light: 20, sight: 20, sound: 20, dir: 0, door: 0, ds: 0, flags: { floorer: { role: "outlineWall", levelId: "f1" } } };

test("distanceToWall measures point-to-segment distance", () => {
  expect(distanceToWall([150, 10], [0, 0, 300, 0])).toBe(10);
  expect(distanceToWall([-30, 40], [0, 0, 300, 0])).toBe(50);
});

test("nearestWall picks the closest wall within tolerance", () => {
  const a = { id: "a", c: [0, 0, 100, 0] };
  const b = { id: "b", c: [0, 50, 100, 50] };
  expect(nearestWall([a, b], [50, 30], 40)).toBe(b);
  expect(nearestWall([a, b], [50, 20], 40)).toBe(a);
  expect(nearestWall([a, b], [50, 25], 4)).toBeNull();
  expect(nearestWall([{ id: "bad", c: [] }], [0, 0], 10)).toBeNull();
});

test("splitWallAt cuts a door of the given width centred on the click projection", () => {
  const { pieces, door } = splitWallAt(source, [150, 12], 100);
  expect(door).toBe(1);
  expect(pieces.map((p) => p.c)).toEqual([
    [0, 0, 100, 0],
    [100, 0, 200, 0],
    [200, 0, 300, 0],
  ]);
  for (const p of pieces) expect(p).toMatchObject({ levels: ["f1"], move: 20, light: 20, sight: 20, sound: 20, flags: source.flags });
  expect(pieces[0]._id).toBeUndefined();
});

test("splitWallAt clamps the door to the wall ends and drops sub-pixel pieces", () => {
  const { pieces, door } = splitWallAt(source, [5, 0], 100);
  expect(door).toBe(0);
  expect(pieces.map((p) => p.c)).toEqual([
    [0, 0, 100, 0],
    [100, 0, 300, 0],
  ]);
  const end = splitWallAt(source, [400, 0], 100);
  expect(end.door).toBe(1);
  expect(end.pieces.map((p) => p.c)).toEqual([
    [0, 0, 200, 0],
    [200, 0, 300, 0],
  ]);
});

test("splitWallAt turns a wall shorter than the door into a single door piece", () => {
  const short = { ...source, c: [0, 0, 60, 0] };
  const { pieces, door } = splitWallAt(short, [10, 0], 100);
  expect(door).toBe(0);
  expect(pieces).toHaveLength(1);
  expect(pieces[0].c).toEqual([0, 0, 60, 0]);
});

test("splitWallAt works on diagonal walls and rounds coordinates", () => {
  const diag = { ...source, c: [0, 0, 300, 300] };
  const { pieces } = splitWallAt(diag, [150, 150], 100);
  expect(pieces).toHaveLength(3);
  expect(pieces[1].c).toEqual([115, 115, 185, 185]);
  expect(pieces.every((p) => p.c.every(Number.isInteger))).toBe(true);
});

test("doorPiece and windowPiece set the door and sense fields", () => {
  const piece = { c: [0, 0, 10, 0], move: 20, sight: 20, light: 20, sound: 20 };
  expect(doorPiece(piece)).toEqual({ ...piece, door: 1, ds: 0 });
  expect(windowPiece(piece, { move: 20 })).toEqual({ ...piece, door: 0, ds: 0, move: 20, sight: 0, light: 0, sound: 0 });
});
