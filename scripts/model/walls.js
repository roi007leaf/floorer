import { FLAG_VERSION, ROLES } from "../constants.js";

const ELLIPSE_SIDES = 24;

function plain(shape) {
  return typeof shape?.toObject === "function" ? shape.toObject() : shape;
}

function rotate(points, cx, cy, degrees) {
  if (!degrees) return points;
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const out = [];
  for (let i = 0; i < points.length; i += 2) {
    const dx = points[i] - cx;
    const dy = points[i + 1] - cy;
    out.push(cx + dx * cos - dy * sin, cy + dx * sin + dy * cos);
  }
  return out;
}

function rectangleRing(s) {
  const ring = [s.x, s.y, s.x + s.width, s.y, s.x + s.width, s.y + s.height, s.x, s.y + s.height];
  return rotate(ring, s.x + s.width / 2, s.y + s.height / 2, s.rotation);
}

function ellipseRing(s, rx, ry) {
  const ring = [];
  for (let i = 0; i < ELLIPSE_SIDES; i++) {
    const a = (i / ELLIPSE_SIDES) * 2 * Math.PI;
    ring.push(s.x + rx * Math.cos(a), s.y + ry * Math.sin(a));
  }
  return rotate(ring, s.x, s.y, s.rotation);
}

function ringOf(shape) {
  const s = plain(shape);
  if (s?.type === "rectangle") return rectangleRing(s);
  if (s?.type === "ellipse") return ellipseRing(s, s.radiusX, s.radiusY);
  if (s?.type === "circle") return ellipseRing(s, s.radius, s.radius);
  if (s?.type === "polygon") return Array.from(s.points ?? []);
  return null;
}

function ringSegments(ring) {
  const n = Math.floor(ring.length / 2);
  const segments = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const seg = [ring[2 * i], ring[2 * i + 1], ring[2 * j], ring[2 * j + 1]].map(Math.round);
    if (seg[0] !== seg[2] || seg[1] !== seg[3]) segments.push(seg);
  }
  return segments;
}

export function outlineSegments(shapes) {
  return Array.from(shapes ?? []).flatMap((shape) => {
    const ring = ringOf(shape);
    return ring ? ringSegments(ring) : [];
  });
}

export function wallCreateData(levelId, segments) {
  return segments.map((c) => ({ c, levels: [levelId], flags: { floorer: { role: ROLES.OUTLINE_WALL, levelId, managed: true, v: FLAG_VERSION } } }));
}

export function isOutlineWall(doc, levelId) {
  const flag = doc?.flags?.floorer;
  return flag?.role === ROLES.OUTLINE_WALL && (levelId === undefined || flag.levelId === levelId);
}

export function outlineWallsFor(entry) {
  if (!entry?.surface) return null;
  return wallCreateData(entry.level.id, outlineSegments(entry.surface.shapes));
}
