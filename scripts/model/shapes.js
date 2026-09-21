function plain(shape) {
  if (!shape) return null;
  return typeof shape.toObject === "function" ? shape.toObject() : shape;
}

function r(n) {
  return Math.round(n);
}

function at(s) {
  return `@ ${r(s.x)},${r(s.y)}`;
}

export function shapeSummary(shape) {
  const s = plain(shape);
  if (!s) return "";
  if (s.type === "rectangle") return `${r(s.width)}×${r(s.height)} ${at(s)}`;
  if (s.type === "polygon") return `polygon · ${Math.floor((s.points?.length ?? 0) / 2)} pts`;
  if (s.type === "circle") return `r ${r(s.radius)} ${at(s)}`;
  if (s.type === "ellipse") return `r ${r(s.radiusX)}×${r(s.radiusY)} ${at(s)}`;
  return s.type ?? "";
}

function polygonCenter(points) {
  const n = Math.floor(points.length / 2);
  if (!n) return null;
  let x = 0;
  let y = 0;
  for (let i = 0; i < n; i++) {
    x += points[2 * i];
    y += points[2 * i + 1];
  }
  return { x: x / n, y: y / n };
}

export function shapeCenter(shape) {
  const s = plain(shape);
  if (!s) return null;
  if (s.type === "rectangle") return { x: s.x + s.width / 2, y: s.y + s.height / 2 };
  if (s.type === "polygon") return polygonCenter(s.points ?? []);
  if (s.type === "circle" || s.type === "ellipse") return { x: s.x, y: s.y };
  return null;
}
