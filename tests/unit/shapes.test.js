import { padShape, shapeCenter, shapesContain, shapeSummary, STAIR_OPENING_PAD } from "../../scripts/model/shapes.js";

test("shapeSummary describes rectangles, polygons and round shapes", () => {
  expect(shapeSummary({ type: "rectangle", x: 10, y: 20, width: 300, height: 400 })).toBe("300×400 @ 10,20");
  expect(shapeSummary({ type: "polygon", points: [0, 0, 10, 0, 10, 10] })).toBe("polygon · 3 pts");
  expect(shapeSummary({ type: "circle", x: 5, y: 6, radius: 50 })).toBe("r 50 @ 5,6");
  expect(shapeSummary({ type: "ellipse", x: 5, y: 6, radiusX: 50, radiusY: 25 })).toBe("r 50×25 @ 5,6");
  expect(shapeSummary(null)).toBe("");
});

test("shapeSummary unwraps toObject shapes and rounds", () => {
  expect(shapeSummary({ toObject: () => ({ type: "rectangle", x: 1.4, y: 2.6, width: 3.5, height: 4 }) })).toBe("4×4 @ 1,3");
});

test("shapeCenter", () => {
  expect(shapeCenter({ type: "rectangle", x: 10, y: 20, width: 300, height: 400 })).toEqual({ x: 160, y: 220 });
  expect(shapeCenter({ type: "circle", x: 5, y: 6, radius: 50 })).toEqual({ x: 5, y: 6 });
  expect(shapeCenter({ type: "ellipse", x: 5, y: 6, radiusX: 50, radiusY: 25 })).toEqual({ x: 5, y: 6 });
  expect(shapeCenter({ type: "polygon", points: [0, 0, 10, 0, 10, 10, 0, 10] })).toEqual({ x: 5, y: 5 });
  expect(shapeCenter({ type: "polygon", points: [] })).toBeNull();
  expect(shapeCenter(null)).toBeNull();
});

test("STAIR_OPENING_PAD is 6", () => {
  expect(STAIR_OPENING_PAD).toBe(6);
});

test("padShape grows a rectangle outward on every side", () => {
  expect(padShape({ type: "rectangle", x: 10, y: 20, width: 30, height: 40 }, 6)).toEqual({ type: "rectangle", x: 4, y: 14, width: 42, height: 52 });
});

test("padShape grows an ellipse's radii", () => {
  expect(padShape({ type: "ellipse", x: 5, y: 6, radiusX: 50, radiusY: 25 }, 6)).toEqual({ type: "ellipse", x: 5, y: 6, radiusX: 56, radiusY: 31 });
});

test("padShape grows a circle's radius", () => {
  expect(padShape({ type: "circle", x: 5, y: 6, radius: 50 }, 6)).toEqual({ type: "circle", x: 5, y: 6, radius: 56 });
});

test("padShape pushes polygon points away from the centroid, skipping points at the centroid", () => {
  const square = { type: "polygon", points: [0, 0, 10, 0, 10, 10, 0, 10] };
  const padded = padShape(square, 5);
  expect(padded.points[0]).toBeCloseTo(-5 / Math.SQRT2);
  expect(padded.points[1]).toBeCloseTo(-5 / Math.SQRT2);
  expect(padShape({ type: "polygon", points: [2, 2, 2, 2, 2, 2] }, 5).points).toEqual([2, 2, 2, 2, 2, 2]);
});

test("padShape unwraps toObject shapes and leaves the original untouched", () => {
  const rect = { type: "rectangle", x: 0, y: 0, width: 10, height: 10 };
  const shape = { toObject: () => rect };
  expect(padShape(shape, 2)).toEqual({ type: "rectangle", x: -2, y: -2, width: 14, height: 14 });
  expect(rect).toEqual({ type: "rectangle", x: 0, y: 0, width: 10, height: 10 });
});

test("shapesContain: rectangle containment ignores rotation", () => {
  const rect = { type: "rectangle", x: 0, y: 0, width: 10, height: 10, rotation: 45, hole: false };
  expect(shapesContain([rect], { x: 5, y: 5 })).toBe(true);
  expect(shapesContain([rect], { x: 20, y: 20 })).toBe(false);
});

test("shapesContain: ellipse containment ignores rotation", () => {
  const ellipse = { type: "ellipse", x: 0, y: 0, radiusX: 10, radiusY: 5, rotation: 30, hole: false };
  expect(shapesContain([ellipse], { x: 5, y: 0 })).toBe(true);
  expect(shapesContain([ellipse], { x: 0, y: 6 })).toBe(false);
});

test("shapesContain: circle containment", () => {
  const circle = { type: "circle", x: 0, y: 0, radius: 10, hole: false };
  expect(shapesContain([circle], { x: 5, y: 5 })).toBe(true);
  expect(shapesContain([circle], { x: 8, y: 8 })).toBe(false);
});

test("shapesContain: polygon containment via ray casting", () => {
  const polygon = { type: "polygon", points: [0, 0, 10, 0, 10, 10, 0, 10], hole: false };
  expect(shapesContain([polygon], { x: 5, y: 5 })).toBe(true);
  expect(shapesContain([polygon], { x: 15, y: 5 })).toBe(false);
});

test("shapesContain: a point inside a hole is excluded even though a non-hole shape contains it", () => {
  const outer = { type: "rectangle", x: 0, y: 0, width: 10, height: 10, hole: false };
  const hole = { type: "rectangle", x: 2, y: 2, width: 4, height: 4, hole: true };
  expect(shapesContain([outer, hole], { x: 4, y: 4 })).toBe(false);
  expect(shapesContain([outer, hole], { x: 1, y: 1 })).toBe(true);
});

test("shapesContain returns false with no containing shape or no point", () => {
  expect(shapesContain([], { x: 0, y: 0 })).toBe(false);
  expect(shapesContain([{ type: "rectangle", x: 0, y: 0, width: 1, height: 1, hole: false }], null)).toBe(false);
});
