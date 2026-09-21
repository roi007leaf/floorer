import { shapeCenter, shapeSummary } from "../../scripts/model/shapes.js";

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
