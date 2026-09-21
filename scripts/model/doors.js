const MIN_PIECE = 1;

function segmentOf(wall) {
  return Array.from(wall.c ?? []);
}

function projection([px, py], [ax, ay, bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return { t, length: Math.sqrt(len2), x: ax + t * dx, y: ay + t * dy };
}

export function distanceToWall(point, c) {
  const p = projection(point, c);
  return Math.hypot(point[0] - p.x, point[1] - p.y);
}

export function nearestWall(walls, point, tolerance) {
  let best = null;
  let bestDist = tolerance;
  for (const wall of walls) {
    const c = segmentOf(wall);
    if (c.length !== 4) continue;
    const d = distanceToWall(point, c);
    if (d <= bestDist) {
      bestDist = d;
      best = wall;
    }
  }
  return best;
}

function pointAt([ax, ay, bx, by], length, s) {
  const t = length === 0 ? 0 : s / length;
  return [Math.round(ax + (bx - ax) * t), Math.round(ay + (by - ay) * t)];
}

function pieceLength([x1, y1, x2, y2]) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function baseOf(source) {
  const { _id, c, ...rest } = source;
  return rest;
}

export function splitWallAt(wallSource, point, width) {
  const c = segmentOf(wallSource).map(Math.round);
  const base = baseOf(wallSource);
  const { t, length } = projection(point, c);
  if (length <= width) return { pieces: [{ ...base, c }], door: 0 };
  const center = Math.max(width / 2, Math.min(length - width / 2, t * length));
  const start = pointAt(c, length, center - width / 2);
  const end = pointAt(c, length, center + width / 2);
  const candidates = [
    { c: [c[0], c[1], start[0], start[1]], door: false },
    { c: [start[0], start[1], end[0], end[1]], door: true },
    { c: [end[0], end[1], c[2], c[3]], door: false },
  ].filter((p) => pieceLength(p.c) >= MIN_PIECE);
  return { pieces: candidates.map((p) => ({ ...base, c: p.c })), door: candidates.findIndex((p) => p.door) };
}

export function doorPiece(piece) {
  return { ...piece, door: 1, ds: 0 };
}

export function windowPiece(piece, { move = 20 } = {}) {
  return { ...piece, door: 0, ds: 0, move, sight: 0, light: 0, sound: 0 };
}
