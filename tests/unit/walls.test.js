import { interiorWallCreateData, isFloorerWall, isOutlineWall, outlineSegments, outlineWallsFor, wallCreateData } from "../../scripts/model/walls.js";

const rect = { type: "rectangle", x: 10, y: 20, width: 100, height: 50, rotation: 0, hole: false };

test("outlineSegments turns a rectangle into four closed edges", () => {
  expect(outlineSegments([rect])).toEqual([
    [10, 20, 110, 20],
    [110, 20, 110, 70],
    [110, 70, 10, 70],
    [10, 70, 10, 20],
  ]);
});

test("outlineSegments rotates rectangles about their center", () => {
  const segs = outlineSegments([{ ...rect, rotation: 90 }]);
  expect(segs).toHaveLength(4);
  expect(segs[0]).toEqual([85, -5, 85, 95]);
});

test("outlineSegments walks polygons in order and closes them", () => {
  const segs = outlineSegments([{ type: "polygon", points: [0, 0, 10, 0, 10, 10], hole: false }]);
  expect(segs).toEqual([
    [0, 0, 10, 0],
    [10, 0, 10, 10],
    [10, 10, 0, 0],
  ]);
});

test("outlineSegments approximates ellipses and circles with 24 edges", () => {
  const ellipse = outlineSegments([{ type: "ellipse", x: 0, y: 0, radiusX: 100, radiusY: 50, rotation: 0, hole: false }]);
  expect(ellipse).toHaveLength(24);
  expect(ellipse[0].slice(0, 2)).toEqual([100, 0]);
  expect(ellipse[6].slice(0, 2)).toEqual([0, 50]);
  expect(outlineSegments([{ type: "circle", x: 5, y: 5, radius: 10 }])).toHaveLength(24);
});

test("outlineSegments includes hole rings and drops degenerate edges", () => {
  const hole = { type: "polygon", points: [1, 1, 1, 1, 5, 1, 5, 5], hole: true };
  const segs = outlineSegments([rect, hole]);
  expect(segs).toHaveLength(7);
  expect(segs.every(([x1, y1, x2, y2]) => x1 !== x2 || y1 !== y2)).toBe(true);
});

test("outlineSegments rounds to integers and unwraps data models", () => {
  const shape = { toObject: () => ({ type: "polygon", points: [0.4, 0.6, 9.5, 0.2, 9.9, 10.1] }) };
  expect(outlineSegments([shape])[0]).toEqual([0, 1, 10, 0]);
  expect(outlineSegments([{ type: "unknown" }])).toEqual([]);
});

test("wallCreateData tags each wall to exactly its own level", () => {
  const data = wallCreateData("f1", [[0, 0, 10, 0]]);
  expect(data).toEqual([{ c: [0, 0, 10, 0], levels: ["f1"], flags: { floorer: { role: "outlineWall", levelId: "f1", managed: true, v: 1 } } }]);
});

test("outlineWallsFor builds walls from the entry surface", () => {
  const entry = { level: { id: "f1" }, surface: { shapes: [rect] } };
  const walls = outlineWallsFor(entry);
  expect(walls).toHaveLength(4);
  expect(walls.every((w) => w.levels[0] === "f1" && w.flags.floorer.levelId === "f1")).toBe(true);
  expect(outlineWallsFor({ level: { id: "f1" }, surface: null })).toBeNull();
});

const hole = { type: "polygon", points: [1, 1, 1, 1, 5, 1, 5, 5], hole: true };

test("outlineWallsFor includes a traced hole ring from the image trace", () => {
  const entry = { level: { id: "f1" }, surface: { shapes: [rect, hole], flags: { floorer: { holes: [{ id: "h1", traced: true }] } } } };
  expect(outlineWallsFor(entry)).toHaveLength(7);
});

test("outlineWallsFor skips a stair opening's hole ring", () => {
  const entry = { level: { id: "f1" }, surface: { shapes: [rect, hole], flags: { floorer: { holes: [{ id: "h1", stairId: "s1" }] } } } };
  expect(outlineWallsFor(entry)).toHaveLength(4);
});

test("outlineWallsFor skips a drawn hole's ring", () => {
  const entry = { level: { id: "f1" }, surface: { shapes: [rect, hole], flags: { floorer: { holes: [{ id: "h1" }] } } } };
  expect(outlineWallsFor(entry)).toHaveLength(4);
});

test("interiorWallCreateData tags traced walls with the interior role", () => {
  const data = interiorWallCreateData("f1", [[0, 0, 10, 0]]);
  expect(data).toEqual([{ c: [0, 0, 10, 0], levels: ["f1"], flags: { floorer: { role: "interiorWall", levelId: "f1", managed: true, v: 1 } } }]);
});

test("isFloorerWall matches both wall roles while isOutlineWall matches only outlines", () => {
  const outline = { flags: { floorer: { role: "outlineWall", levelId: "f1" } } };
  const interior = { flags: { floorer: { role: "interiorWall", levelId: "f1" } } };
  expect(isFloorerWall(outline, "f1")).toBe(true);
  expect(isFloorerWall(interior, "f1")).toBe(true);
  expect(isFloorerWall(interior, "f2")).toBe(false);
  expect(isFloorerWall({ flags: {} })).toBe(false);
  expect(isOutlineWall(interior, "f1")).toBe(false);
  expect(isOutlineWall(outline)).toBe(true);
});
