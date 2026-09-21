import { canTrace, imagePlacement, ringsToShapes, signedArea, simplifyRing, simplifyRings, traceAlpha, traceFootprint } from "../../scripts/model/trace.js";

function grid(rows) {
  const height = rows.length;
  const width = rows[0].length;
  const alpha = new Uint8Array(width * height);
  rows.forEach((row, y) => [...row].forEach((c, x) => (alpha[y * width + x] = c === "#" ? 255 : 0)));
  return { width, height, alpha };
}

const trace = (rows, threshold = 0.5) => traceAlpha({ ...grid(rows), threshold });

function asPairs(points) {
  const out = [];
  for (let i = 0; i < points.length; i += 2) out.push([points[i], points[i + 1]]);
  return out;
}

const square = ["....", ".##.", ".##.", "...."];

test("traceAlpha outlines a filled block with a closed outer ring", () => {
  const { coverage, rings } = trace(square);
  expect(coverage).toBeCloseTo(4 / 16);
  expect(rings).toHaveLength(1);
  expect(rings[0].hole).toBe(false);
  expect(asPairs(rings[0].points)).toEqual([
    [1, 1],
    [3, 1],
    [3, 3],
    [1, 3],
  ]);
});

test("traceAlpha closes rings touching the image border", () => {
  const { rings } = trace(["##", "##"]);
  expect(rings).toHaveLength(1);
  expect(Math.abs(signedArea(rings[0].points))).toBe(4);
});

test("traceAlpha reports holes with negative winding", () => {
  const { rings } = trace(["#####", "#...#", "#.#.#", "#...#", "#####"]);
  expect(rings).toHaveLength(3);
  const outer = rings.filter((r) => !r.hole);
  const holes = rings.filter((r) => r.hole);
  expect(outer.map((r) => signedArea(r.points)).sort()).toEqual([1, 25]);
  expect(holes.map((r) => signedArea(r.points))).toEqual([-9]);
});

test("traceAlpha separates disconnected islands", () => {
  const { rings } = trace(["##..##", "##..##"]);
  expect(rings).toHaveLength(2);
  expect(rings.every((r) => !r.hole)).toBe(true);
});

test("traceAlpha keeps diagonally touching pixels as separate rings", () => {
  const { rings } = trace(["#.", ".#"]);
  expect(rings).toHaveLength(2);
  expect(rings.map((r) => Math.abs(signedArea(r.points)))).toEqual([1, 1]);
});

test("traceAlpha ignores specks below 0.05% of the image", () => {
  const rows = Array.from({ length: 100 }, () => ".".repeat(100));
  rows[50] = "#" + ".".repeat(99);
  rows[10] = "." + "#".repeat(20) + ".".repeat(79);
  const { rings } = trace(rows);
  expect(rings).toHaveLength(1);
  expect(Math.abs(signedArea(rings[0].points))).toBe(20);
});

test("traceAlpha applies the threshold to the alpha channel", () => {
  const img = { width: 2, height: 1, alpha: [100, 200] };
  expect(traceAlpha({ ...img, threshold: 0.75 }).coverage).toBe(0.5);
  expect(traceAlpha({ ...img, threshold: 0.3 }).coverage).toBe(1);
  expect(traceAlpha({ ...img, threshold: 0.9 }).rings).toEqual([]);
});

test("simplifyRing removes points within epsilon", () => {
  const points = [0, 0, 5, 0.4, 10, 0, 10, 10, 5, 10.2, 0, 10];
  expect(asPairs(simplifyRing(points, 1))).toEqual([
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ]);
});

test("simplifyRing keeps a staircase corner beyond epsilon", () => {
  const points = [0, 0, 10, 0, 10, 5, 20, 5, 20, 10, 0, 10];
  expect(simplifyRing(points, 1).length / 2).toBe(6);
});

test("simplifyRing keeps at least four points", () => {
  const points = [0, 0, 1, 0, 1, 1, 0, 1, 0, 0.5];
  expect(simplifyRing(points, 5).length / 2).toBeGreaterThanOrEqual(4);
  expect(simplifyRing([0, 0, 1, 0, 1, 1], 5)).toEqual([0, 0, 1, 0, 1, 1]);
});

test("simplifyRings raises epsilon until the point budget is met", () => {
  const points = [];
  for (let i = 0; i < 100; i++) points.push(i, i % 2);
  points.push(100, 50, 0, 50);
  const rings = [{ points, hole: false }];
  expect(simplifyRings(rings, 0.1, 1000)[0].points.length / 2).toBe(102);
  expect(simplifyRings(rings, 0.1, 10)[0].points.length / 2).toBeLessThanOrEqual(10);
});

test("simplifyRings drops the smallest rings when simplification cannot meet the budget", () => {
  const box = (x, y, size) => ({ points: [x, y, x + size, y, x + size, y + size, x, y + size], hole: false });
  const rings = [box(0, 0, 1), box(10, 0, 5), box(20, 0, 2)];
  const out = simplifyRings(rings, 1, 8);
  expect(out.map((r) => r.points[0])).toEqual([10, 20]);
});

test("ringsToShapes maps rings into polygon shapes", () => {
  const rings = [
    { points: [0, 0, 1, 0, 1, 1, 0, 1], hole: false },
    { points: [0, 0, 0, 1, 1, 1, 1, 0], hole: true },
  ];
  const shapes = ringsToShapes(rings, (x, y) => ({ x: x * 10 + 100, y: y * 10 + 200 }));
  expect(shapes[0]).toEqual({ type: "polygon", points: [100, 200, 110, 200, 110, 210, 100, 210], hole: false });
  expect(shapes[1].hole).toBe(true);
});

const rect = { x: 100, y: 200, width: 1000, height: 500 };
const level = (textures) => ({ textures });

test("imagePlacement fill stretches the image over the scene rect", () => {
  expect(imagePlacement(level({}), rect, 200, 50)).toEqual({ x: 100, y: 200, scaleX: 5, scaleY: 10 });
});

test("imagePlacement contain and cover keep aspect ratio around the center", () => {
  const contain = imagePlacement(level({ fit: "contain" }), rect, 200, 50);
  expect(contain).toEqual({ x: 100, y: 325, scaleX: 5, scaleY: 5 });
  const cover = imagePlacement(level({ fit: "cover" }), rect, 200, 50);
  expect(cover).toEqual({ x: -400, y: 200, scaleX: 10, scaleY: 10 });
});

test("imagePlacement width and height follow one axis", () => {
  expect(imagePlacement(level({ fit: "width" }), rect, 500, 500)).toEqual({ x: 100, y: -50, scaleX: 2, scaleY: 2 });
  expect(imagePlacement(level({ fit: "height" }), rect, 500, 500)).toEqual({ x: 350, y: 200, scaleX: 1, scaleY: 1 });
});

test("imagePlacement applies anchor, offset and scale like the level mesh", () => {
  const t = { fit: "contain", anchorX: 0, anchorY: 1, offsetX: 10, offsetY: -20, scaleX: 2, scaleY: 0.5 };
  const p = imagePlacement(level(t), rect, 200, 50);
  expect(p.scaleX).toBe(10);
  expect(p.scaleY).toBe(2.5);
  expect(p.x).toBe(610);
  expect(p.y).toBe(430 - 125);
});

test("canTrace needs a background image without rotation", () => {
  expect(canTrace({ background: { src: "a.webp" }, textures: { rotation: 0 } })).toBe(true);
  expect(canTrace({ background: { src: "a.webp" } })).toBe(true);
  expect(canTrace({ background: { src: null } })).toBe(false);
  expect(canTrace({ background: { src: "a.webp" }, textures: { rotation: 90 } })).toBe(false);
});

const image = (rows, imageWidth, imageHeight) => ({ ...grid(rows), imageWidth, imageHeight });

test("traceFootprint falls back when the image is nearly fully opaque", () => {
  const rows = Array.from({ length: 10 }, () => "#".repeat(10));
  rows[0] = "." + "#".repeat(9);
  expect(traceFootprint(image(rows, 10, 10), { background: { src: "a" } }, rect)).toBeNull();
});

test("traceFootprint falls back when nothing is opaque", () => {
  expect(traceFootprint(image(["..", ".."], 2, 2), { background: { src: "a" } }, rect)).toBeNull();
});

test("traceFootprint maps the downscaled outline into scene space", () => {
  const img = image(square, 40, 40);
  const shapes = traceFootprint(img, { background: { src: "a", alphaThreshold: 0.5 }, textures: { fit: "contain" } }, { x: 0, y: 0, width: 400, height: 400 });
  expect(shapes).toHaveLength(1);
  expect(shapes[0].type).toBe("polygon");
  expect(shapes[0].hole).toBe(false);
  expect(asPairs(shapes[0].points)).toEqual([
    [100, 100],
    [300, 100],
    [300, 300],
    [100, 300],
  ]);
});

test("traceFootprint honours the point budget", () => {
  const rows = Array.from({ length: 60 }, (_, y) => Array.from({ length: 60 }, (_, x) => ((x + y) % 4 < 2 && x > 5 && x < 55 && y > 5 && y < 55 ? "#" : ".")).join(""));
  const shapes = traceFootprint(image(rows, 60, 60), { background: { src: "a" } }, rect, { maxPoints: 40 });
  expect(shapes.reduce((n, s) => n + s.points.length / 2, 0)).toBeLessThanOrEqual(40);
});
