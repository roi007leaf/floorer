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

export const STAIR_OPENING_PAD = 6;

function padRectangle(s, pad) {
  return { ...s, x: s.x - pad, y: s.y - pad, width: s.width + 2 * pad, height: s.height + 2 * pad };
}

function padEllipse(s, pad) {
  return { ...s, radiusX: s.radiusX + pad, radiusY: s.radiusY + pad };
}

function padCircle(s, pad) {
  return { ...s, radius: s.radius + pad };
}

function padPoint(x, y, center, pad) {
  const dx = x - center.x;
  const dy = y - center.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return [x, y];
  return [x + (dx / len) * pad, y + (dy / len) * pad];
}

function padPolygon(s, pad) {
  const points = s.points ?? [];
  const center = polygonCenter(points);
  if (!center) return { ...s };
  const padded = [];
  for (let i = 0; i < points.length; i += 2) padded.push(...padPoint(points[i], points[i + 1], center, pad));
  return { ...s, points: padded };
}

export function padShape(shape, pad) {
  const s = plain(shape);
  if (!s) return s;
  if (s.type === "rectangle") return padRectangle(s, pad);
  if (s.type === "ellipse") return padEllipse(s, pad);
  if (s.type === "circle") return padCircle(s, pad);
  if (s.type === "polygon") return padPolygon(s, pad);
  return { ...s };
}
