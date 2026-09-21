import { edgeMask, grayscale, houghSegments, mergeParallel, nearSegment, previewSvgLines, segmentsBounds, segmentsToScene, sobelEdges, traceInteriorWalls, traceWallSegments, viewFit, withoutOutline } from "../../scripts/model/wall-trace.js";

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

function synthetic(width, height, paint, base = 153) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = paint(x, y) ?? base;
      data.set([v, v, v, 255], (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

function maskOf(rows) {
  const height = rows.length;
  const width = rows[0].length;
  const mask = new Uint8Array(width * height);
  rows.forEach((row, y) => [...row].forEach((c, x) => (mask[y * width + x] = c === "#" ? 1 : 0)));
  return { mask, width, height };
}

const bandAndSeam = (x, y) => (y >= 100 && y <= 105 ? 0 : y === 150 ? 128 : undefined);

test("grayscale converts to luminance and treats transparent pixels as white", () => {
  const img = image(["#. "], { dark: [255, 0, 0, 255] });
  const gray = Array.from(grayscale(img));
  expect(gray[0]).toBeCloseTo(0.2126, 4);
  expect(gray[1]).toBe(1);
  expect(gray[2]).toBe(1);
});

test("sobelEdges reports the contrast of a step edge and nothing on flat areas", () => {
  const gray = Float32Array.from([1, 1, 1, 1, 1, 1, 1, 1, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4]);
  const mag = sobelEdges(gray, 4, 4);
  expect(mag[1 * 4 + 1]).toBeCloseTo(0.6, 5);
  expect(mag[2 * 4 + 1]).toBeCloseTo(0.6, 5);
  expect(mag[0]).toBe(0);
  expect(mag[3 * 4 + 3]).toBe(0);
});

test("edgeMask thresholds magnitudes", () => {
  expect(Array.from(edgeMask(Float32Array.from([0.1, 0.4, 0.9]), 0.35))).toEqual([0, 1, 1]);
});

test("houghSegments finds a straight run and ignores scattered pixels", () => {
  const rows = ["............", ".##########.", "............", "............", "............", "............", "............", "..#....#....", "............"];
  const { mask, width, height } = maskOf(rows);
  const segs = houghSegments(mask, width, height, { minLength: 5, votes: 3 });
  expect(segs).toHaveLength(1);
  const [x1, y1, x2, y2] = segs[0];
  expect([y1, y2]).toEqual([1, 1]);
  expect(Math.min(x1, x2)).toBe(1);
  expect(Math.max(x1, x2)).toBe(10);
});

test("houghSegments bridges small gaps but not large ones", () => {
  const { mask, width, height } = maskOf(["....................", ".####.####.....####.", "...................."]);
  const segs = houghSegments(mask, width, height, { minLength: 6, maxGap: 1, votes: 3 });
  expect(segs).toHaveLength(1);
  expect(Math.abs(segs[0][2] - segs[0][0])).toBe(8);
});

test("houghSegments is deterministic", () => {
  const { mask, width, height } = maskOf(["..............", ".############.", "..............", "..............", "..............", ".############.", ".............."]);
  const a = houghSegments(mask, width, height, { minLength: 8, votes: 4 });
  const b = houghSegments(mask, width, height, { minLength: 8, votes: 4 });
  expect(a).toEqual(b);
  expect(a).toHaveLength(2);
});

test("mergeParallel joins the two edges of a wall into its centerline", () => {
  const merged = mergeParallel(
    [
      [0, 10, 100, 10],
      [5, 16, 105, 16],
    ],
    8,
  );
  expect(merged).toHaveLength(1);
  const [x1, y1, x2, y2] = merged[0];
  expect(y1).toBeCloseTo(13, 5);
  expect(y2).toBeCloseTo(13, 5);
  expect(Math.min(x1, x2)).toBeCloseTo(0, 5);
  expect(Math.max(x1, x2)).toBeCloseTo(105, 5);
});

test("mergeParallel joins collinear segments end to end and keeps distant or crossing ones", () => {
  const merged = mergeParallel(
    [
      [0, 0, 40, 0],
      [42, 0, 80, 0],
      [0, 30, 80, 30],
      [50, 40, 50, 90],
    ],
    4,
  );
  expect(merged).toHaveLength(3);
  const long = merged.find(([, y1]) => Math.abs(y1) < 1e-6);
  expect(Math.abs(long[2] - long[0])).toBeCloseTo(80, 5);
});

test("traceInteriorWalls yields one wall for a dark band and none for a faint seam", () => {
  const img = synthetic(200, 200, bandAndSeam);
  const { segments, stats } = traceInteriorWalls(img, { edgeStrength: 0.35, minLength: 50, mergeGap: 10 });
  expect(stats.edgePixels).toBe(4 * 198);
  expect(stats.rawSegments).toBeGreaterThanOrEqual(2);
  expect(segments).toHaveLength(1);
  const [x1, y1, x2, y2] = segments[0];
  expect(Math.abs(y1 - 102.5)).toBeLessThanOrEqual(1.5);
  expect(Math.abs(y2 - 102.5)).toBeLessThanOrEqual(1.5);
  expect(Math.abs(x2 - x1)).toBeGreaterThanOrEqual(150);
});

test("traceInteriorWalls picks up the faint seam when the edge strength is lowered", () => {
  const img = synthetic(200, 200, bandAndSeam);
  const { segments } = traceInteriorWalls(img, { edgeStrength: 0.05, minLength: 50, mergeGap: 10 });
  expect(segments).toHaveLength(2);
});

test("traceInteriorWalls returns nothing for a flat image", () => {
  const { segments, stats } = traceInteriorWalls(synthetic(40, 40, () => undefined), { edgeStrength: 0.35, minLength: 5, mergeGap: 2 });
  expect(segments).toEqual([]);
  expect(stats).toEqual({ edgePixels: 0, rawSegments: 0 });
});

test("segmentsToScene maps through the transform, rounds and drops degenerate segments", () => {
  const segs = segmentsToScene(
    [
      [0, 0, 1, 0],
      [5, 5, 5.1, 5.1],
    ],
    (x, y) => ({ x: x * 2.4, y: y * 2.4 + 10 }),
  );
  expect(segs).toEqual([[0, 10, 2, 10]]);
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

test("traceWallSegments maps traced walls into scene space, scales the minimum length and skips outline walls", () => {
  const img = { ...synthetic(200, 200, bandAndSeam), imageWidth: 400, imageHeight: 400 };
  const level = { textures: { fit: "fill" } };
  const sceneRect = { x: 0, y: 0, width: 400, height: 400 };
  const { segments } = traceWallSegments({ image: img, level, sceneRect, gridSize: 100, outline: [] }, { edgeStrength: 0.35, minSquares: 1 });
  expect(segments).toHaveLength(1);
  expect(segments[0][1]).toBeGreaterThanOrEqual(202);
  expect(segments[0][1]).toBeLessThanOrEqual(208);
  expect(Math.abs(segments[0][2] - segments[0][0])).toBeGreaterThanOrEqual(300);
  const long = traceWallSegments({ image: img, level, sceneRect, gridSize: 100, outline: [] }, { edgeStrength: 0.35, minSquares: 5 });
  expect(long.segments).toEqual([]);
  const masked = traceWallSegments({ image: img, level, sceneRect, gridSize: 100, outline: [[0, 205, 400, 205]] }, { edgeStrength: 0.35, minSquares: 1 });
  expect(masked.segments).toEqual([]);
});

test("previewSvgLines maps segments to line attributes", () => {
  expect(previewSvgLines([[1, 2, 3, 4]])).toEqual([{ x1: 1, y1: 2, x2: 3, y2: 4 }]);
  expect(previewSvgLines([])).toEqual([]);
});

test("segmentsBounds returns the bounding box or null", () => {
  expect(segmentsBounds([])).toBeNull();
  expect(
    segmentsBounds([
      [10, 20, 30, 5],
      [0, 8, 12, 40],
    ]),
  ).toEqual({ x: 0, y: 5, width: 30, height: 35 });
});

test("viewFit centers on the rect and clamps the scale", () => {
  const screen = { width: 1000, height: 500 };
  expect(viewFit({ x: 0, y: 0, width: 200, height: 100 }, screen)).toEqual({ x: 100, y: 50, scale: 3 });
  expect(viewFit({ x: 100, y: 100, width: 100000, height: 100 }, screen)).toEqual({ x: 50100, y: 150, scale: 0.15 });
  expect(viewFit({ x: 0, y: 0, width: 2000, height: 500 }, screen).scale).toBeCloseTo(0.425, 5);
});
