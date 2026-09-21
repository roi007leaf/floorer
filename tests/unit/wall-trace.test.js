import { darkMask, nearSegment, polylineLength, polylinesToSegments, simplifyPolyline, skeletonToPolylines, thin, traceInteriorWalls, traceWallSegments, withoutOutline } from "../../scripts/model/wall-trace.js";

function image(rows, { dark = [0, 0, 0, 255], light = [255, 255, 255, 255], clear = [0, 0, 0, 0] } = {}) {
  const height = rows.length;
  const width = rows[0].length;
  const data = new Uint8ClampedArray(width * height * 4);
  rows.forEach((row, y) =>
    [...row].forEach((c, x) => {
      const px = c === "#" ? dark : c === "." ? light : clear;
      data.set(px, (y * width + x) * 4);
    }),
  );
  return { width, height, data };
}

function maskOf(rows) {
  const height = rows.length;
  const width = rows[0].length;
  const mask = new Uint8Array(width * height);
  rows.forEach((row, y) => [...row].forEach((c, x) => (mask[y * width + x] = c === "#" ? 1 : 0)));
  return { mask, width, height };
}

function rows(mask, width, height) {
  const out = [];
  for (let y = 0; y < height; y++) {
    let row = "";
    for (let x = 0; x < width; x++) row += mask[y * width + x] ? "#" : ".";
    out.push(row);
  }
  return out;
}

test("darkMask keeps opaque dark pixels only", () => {
  const img = image(["#. ", "##."]);
  expect(Array.from(darkMask(img))).toEqual([1, 0, 0, 1, 1, 0]);
});

test("darkMask honours threshold and alpha", () => {
  const grey = image(["#"], { dark: [100, 100, 100, 255] });
  expect(Array.from(darkMask(grey, { threshold: 0.28 }))).toEqual([0]);
  expect(Array.from(darkMask(grey, { threshold: 0.5 }))).toEqual([1]);
  const faint = image(["#"], { dark: [0, 0, 0, 100] });
  expect(Array.from(darkMask(faint))).toEqual([0]);
  expect(Array.from(darkMask(faint, { minAlpha: 0.3 }))).toEqual([1]);
});

test("thin reduces a thick horizontal bar to a one-pixel line", () => {
  const { mask, width, height } = maskOf(["........", ".######.", ".######.", ".######.", "........"]);
  const skel = thin(mask, width, height);
  const out = rows(skel, width, height);
  expect(out.filter((r) => r.includes("#"))).toHaveLength(1);
  expect(out[2].replace(/\./g, "").length).toBeGreaterThanOrEqual(3);
});

test("thin leaves a single-pixel line untouched", () => {
  const { mask, width, height } = maskOf(["......", ".####.", "......"]);
  expect(rows(thin(mask, width, height), width, height)).toEqual(["......", ".####.", "......"]);
});

test("skeletonToPolylines walks a straight line end to end", () => {
  const { mask, width, height } = maskOf(["......", ".####.", "......"]);
  const lines = skeletonToPolylines(mask, width, height);
  expect(lines).toHaveLength(1);
  expect(lines[0][0]).toEqual([1, 1]);
  expect(lines[0].at(-1)).toEqual([4, 1]);
  expect(lines[0]).toHaveLength(4);
});

test("skeletonToPolylines breaks at junctions", () => {
  const { mask, width, height } = maskOf([".......", ".#####.", "...#...", "...#...", "...#..."]);
  const lines = skeletonToPolylines(mask, width, height);
  expect(lines).toHaveLength(3);
  const ends = lines.map((l) => [l[0], l.at(-1)]);
  expect(ends.every(([a, b]) => (a[0] === 3 && a[1] === 1) || (b[0] === 3 && b[1] === 1))).toBe(true);
  expect(lines.some((l) => l.some(([x, y]) => x === 3 && y === 4))).toBe(true);
});

test("skeletonToPolylines walks closed loops once", () => {
  const { mask, width, height } = maskOf([".....", ".###.", ".#.#.", ".###.", "....."]);
  const lines = skeletonToPolylines(mask, width, height);
  expect(lines).toHaveLength(1);
  expect(lines[0]).toHaveLength(9);
  expect(lines[0][0]).toEqual(lines[0].at(-1));
});

test("simplifyPolyline drops collinear points and keeps corners", () => {
  const line = [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
    [3, 1],
    [3, 2],
  ];
  expect(simplifyPolyline(line, 0.5)).toEqual([
    [0, 0],
    [3, 0],
    [3, 2],
  ]);
  expect(simplifyPolyline([[0, 0]], 1)).toEqual([[0, 0]]);
});

test("polylineLength sums segment lengths", () => {
  expect(
    polylineLength([
      [0, 0],
      [3, 0],
      [3, 4],
    ]),
  ).toBe(7);
});

test("traceInteriorWalls finds a dark line and drops short specks", () => {
  const img = image(["..........", ".########.", "..........", "......#...", ".........."]);
  const lines = traceInteriorWalls(img, { threshold: 0.28, minLength: 3, epsilon: 0.5 });
  expect(lines).toHaveLength(1);
  expect(lines[0]).toEqual([
    [1, 1],
    [8, 1],
  ]);
});

test("polylinesToSegments maps through the transform and rounds", () => {
  const segs = polylinesToSegments(
    [
      [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
      [[5, 5]],
    ],
    (x, y) => ({ x: x * 2.4, y: y * 2.4 + 10 }),
  );
  expect(segs).toEqual([
    [0, 10, 2, 10],
    [2, 10, 2, 12],
  ]);
});

test("nearSegment measures point-to-segment distance", () => {
  expect(nearSegment([5, 3], [0, 0, 10, 0], 3)).toBe(true);
  expect(nearSegment([5, 4], [0, 0, 10, 0], 3)).toBe(false);
  expect(nearSegment([-4, 0], [0, 0, 10, 0], 3)).toBe(false);
});

test("withoutOutline drops segments whose midpoint sits on an outline wall", () => {
  const outline = [[0, 0, 100, 0]];
  const segs = [
    [10, 2, 60, 3],
    [10, 50, 60, 50],
  ];
  expect(withoutOutline(segs, outline)).toEqual([[10, 50, 60, 50]]);
});

test("traceWallSegments maps traced lines into scene space, scales the minimum length and skips outline walls", () => {
  const img = { ...image(["..........", ".########.", "..........", ".####.....", ".........."]), imageWidth: 20, imageHeight: 10 };
  const level = { textures: { fit: "fill" } };
  const sceneRect = { x: 0, y: 0, width: 200, height: 100 };
  const all = traceWallSegments({ image: img, level, sceneRect, gridSize: 40, outline: [] }, { threshold: 0.28, minSquares: 1, epsilon: 0.5 });
  expect(all).toEqual([
    [20, 20, 160, 20],
    [20, 60, 80, 60],
  ]);
  const long = traceWallSegments({ image: img, level, sceneRect, gridSize: 40, outline: [] }, { threshold: 0.28, minSquares: 2, epsilon: 0.5 });
  expect(long).toEqual([[20, 20, 160, 20]]);
  const masked = traceWallSegments({ image: img, level, sceneRect, gridSize: 40, outline: [[0, 24, 200, 24]] }, { threshold: 0.28, minSquares: 1, epsilon: 0.5 });
  expect(masked).toEqual([[20, 60, 80, 60]]);
});
