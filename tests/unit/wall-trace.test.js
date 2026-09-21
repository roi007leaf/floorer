import { darkMask, nearSegment, openMask, polylineLength, polylinesToSegments, previewSvgLines, simplifyPolyline, skeletonToPolylines, thin, traceInteriorWalls, traceWallSegments, withoutOutline } from "../../scripts/model/wall-trace.js";

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
  const { polylines: lines, stats } = traceInteriorWalls(img, { threshold: 0.28, minLength: 3, epsilon: 0.5 });
  expect(stats).toEqual({ maskPixels: 9, afterOpen: 9 });
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
  const { segments: all, stats } = traceWallSegments({ image: img, level, sceneRect, gridSize: 40, outline: [] }, { threshold: 0.28, minSquares: 1, epsilon: 0.5 });
  expect(stats.maskPixels).toBe(12);
  expect(all).toEqual([
    [20, 20, 160, 20],
    [20, 60, 80, 60],
  ]);
  const long = traceWallSegments({ image: img, level, sceneRect, gridSize: 40, outline: [] }, { threshold: 0.28, minSquares: 2, epsilon: 0.5 });
  expect(long.segments).toEqual([[20, 20, 160, 20]]);
  const masked = traceWallSegments({ image: img, level, sceneRect, gridSize: 40, outline: [[0, 24, 200, 24]] }, { threshold: 0.28, minSquares: 1, epsilon: 0.5 });
  expect(masked.segments).toEqual([[20, 60, 80, 60]]);
});

test("openMask removes features thinner than the structuring element and keeps thick bands", () => {
  const { mask, width, height } = maskOf(["..........", ".########.", "..........", ".########.", ".########.", ".########.", ".........."]);
  const opened = rows(openMask(mask, width, height, 1), width, height);
  expect(opened).toEqual(["..........", "..........", "..........", ".########.", ".########.", ".########.", ".........."]);
  expect(rows(openMask(mask, width, height, 0), width, height)).toEqual(rows(mask, width, height));
  expect(rows(openMask(mask, width, height, 2), width, height).every((r) => !r.includes("#"))).toBe(true);
});

test("traceInteriorWalls with a thickness drops tile seams and traces the thick wall", () => {
  const img = image(["............", ".##########.", "............", ".##########.", ".##########.", ".##########.", "............", "..#..#..#...", "............"]);
  const { polylines, stats } = traceInteriorWalls(img, { threshold: 0.28, minLength: 3, epsilon: 0.5, thicknessPx: 2 });
  expect(stats.afterOpen).toBe(30);
  expect(polylines).toHaveLength(1);
  expect(polylines[0].every(([, y]) => y === 4)).toBe(true);
  expect(traceInteriorWalls(img, { threshold: 0.28, minLength: 3, epsilon: 0.5, thicknessPx: 6 }).stats.afterOpen).toBe(0);
});

test("traceWallSegments converts the thickness from grid squares to downscaled pixels", () => {
  const img = { ...image(["..........", ".########.", "..........", ".########.", ".########.", ".########.", ".........."]), imageWidth: 20, imageHeight: 14 };
  const level = { textures: { fit: "fill" } };
  const sceneRect = { x: 0, y: 0, width: 200, height: 140 };
  const thick = traceWallSegments({ image: img, level, sceneRect, gridSize: 40, outline: [] }, { threshold: 0.28, minSquares: 1, thickness: 1, epsilon: 0.5 });
  expect(thick.stats.afterOpen).toBe(24);
  expect(thick.segments).toHaveLength(1);
  const [x1, y1, x2, y2] = thick.segments[0];
  expect([y1, y2]).toEqual([80, 80]);
  expect(x1).toBeGreaterThanOrEqual(20);
  expect(x2).toBeLessThanOrEqual(160);
  expect(x2 - x1).toBeGreaterThanOrEqual(60);
});

test("previewSvgLines maps segments to line attributes", () => {
  expect(previewSvgLines([[1, 2, 3, 4]])).toEqual([{ x1: 1, y1: 2, x2: 3, y2: 4 }]);
  expect(previewSvgLines([])).toEqual([]);
});
