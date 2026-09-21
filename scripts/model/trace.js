const MIN_RING_FRACTION = 0.0005;
const DIRECTIONS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

function maskOf({ width, height, alpha, threshold }) {
  const cut = threshold * 255;
  const mask = new Uint8Array(width * height);
  let filled = 0;
  for (let i = 0; i < mask.length; i++) {
    if (alpha[i] >= cut) {
      mask[i] = 1;
      filled++;
    }
  }
  return { mask, coverage: mask.length ? filled / mask.length : 0 };
}

function filledAt(mask, width, height, x, y) {
  return x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1;
}

function key(x, y) {
  return `${x},${y}`;
}

function addEdge(edges, x0, y0, dir) {
  const k = key(x0, y0);
  if (!edges.has(k)) edges.set(k, []);
  edges.get(k).push({ x: x0, y: y0, dir, used: false });
}

function boundaryEdges(mask, width, height) {
  const edges = new Map();
  const empty = (x, y) => !filledAt(mask, width, height, x, y);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!filledAt(mask, width, height, x, y)) continue;
      if (empty(x, y - 1)) addEdge(edges, x, y, 0);
      if (empty(x + 1, y)) addEdge(edges, x + 1, y, 1);
      if (empty(x, y + 1)) addEdge(edges, x + 1, y + 1, 2);
      if (empty(x - 1, y)) addEdge(edges, x, y + 1, 3);
    }
  }
  return edges;
}

function nextEdge(edges, x, y, dir) {
  const candidates = (edges.get(key(x, y)) ?? []).filter((e) => !e.used);
  if (candidates.length === 0) return null;
  const rightTurn = (dir + 1) % 4;
  return candidates.find((e) => e.dir === rightTurn) ?? candidates[0];
}

function walkRing(edges, start) {
  const points = [];
  let edge = start;
  while (edge && !edge.used) {
    edge.used = true;
    points.push(edge.x, edge.y);
    const [dx, dy] = DIRECTIONS[edge.dir];
    const x = edge.x + dx;
    const y = edge.y + dy;
    edge = x === start.x && y === start.y ? null : nextEdge(edges, x, y, edge.dir);
  }
  return points;
}

function collinear(ax, ay, bx, by, cx, cy) {
  return (bx - ax) * (cy - by) === (by - ay) * (cx - bx);
}

function dropCollinear(points) {
  const n = points.length / 2;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = (i + n - 1) % n;
    const q = (i + 1) % n;
    if (!collinear(points[2 * p], points[2 * p + 1], points[2 * i], points[2 * i + 1], points[2 * q], points[2 * q + 1])) out.push(points[2 * i], points[2 * i + 1]);
  }
  return out;
}

export function signedArea(points) {
  const n = points.length / 2;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    sum += points[2 * i] * points[2 * j + 1] - points[2 * j] * points[2 * i + 1];
  }
  return sum / 2;
}

function allRings(edges) {
  const rings = [];
  for (const list of edges.values()) {
    for (const edge of list) {
      if (edge.used) continue;
      const points = dropCollinear(walkRing(edges, edge));
      if (points.length >= 6) rings.push(points);
    }
  }
  return rings;
}

export function traceAlpha({ width, height, alpha, threshold }) {
  const { mask, coverage } = maskOf({ width, height, alpha, threshold });
  const minArea = MIN_RING_FRACTION * width * height;
  const rings = allRings(boundaryEdges(mask, width, height))
    .map((points) => ({ points, area: signedArea(points) }))
    .filter((r) => Math.abs(r.area) >= minArea)
    .map((r) => ({ points: r.points, hole: r.area < 0 }));
  return { coverage, rings };
}

function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function farthestFrom(points, index) {
  const n = points.length / 2;
  let best = index;
  let bestDist = -1;
  for (let i = 0; i < n; i++) {
    const d = Math.hypot(points[2 * i] - points[2 * index], points[2 * i + 1] - points[2 * index + 1]);
    if (d > bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

function douglasPeucker(points, first, last, epsilon, keep) {
  let maxDist = -1;
  let index = -1;
  for (let i = first + 1; i < last; i++) {
    const d = segmentDistance(points[2 * i], points[2 * i + 1], points[2 * first], points[2 * first + 1], points[2 * last], points[2 * last + 1]);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (index < 0 || maxDist <= epsilon) return;
  douglasPeucker(points, first, index, epsilon, keep);
  keep.add(index);
  douglasPeucker(points, index, last, epsilon, keep);
}

function pick(points, indices) {
  return Array.from(indices)
    .sort((a, b) => a - b)
    .flatMap((i) => [points[2 * i], points[2 * i + 1]]);
}

function simplifyClosed(points, epsilon) {
  const n = points.length / 2;
  const split = farthestFrom(points, 0);
  const keep = new Set([0, split]);
  douglasPeucker(points, 0, split, epsilon, keep);
  const wrapped = points.concat(points.slice(0, 2));
  const tail = new Set();
  douglasPeucker(wrapped, split, n, epsilon, tail);
  for (const i of tail) keep.add(i % n);
  return pick(points, keep);
}

export function simplifyRing(points, epsilon) {
  if (points.length <= 8) return points;
  const simplified = simplifyClosed(points, epsilon);
  return simplified.length >= 8 ? simplified : simplifyClosed(points, 0);
}

function pointCount(rings) {
  return rings.reduce((n, r) => n + r.points.length / 2, 0);
}

function largestWithin(rings, maxPoints) {
  const bySize = rings.map((r, i) => ({ r, i, area: Math.abs(signedArea(r.points)) })).sort((a, b) => b.area - a.area);
  const kept = [];
  let total = 0;
  for (const entry of bySize) {
    const n = entry.r.points.length / 2;
    if (total + n > maxPoints) break;
    total += n;
    kept.push(entry);
  }
  return kept.sort((a, b) => a.i - b.i).map((e) => e.r);
}

export function simplifyRings(rings, epsilon, maxPoints) {
  let eps = epsilon;
  let out = rings;
  for (let i = 0; i < 12; i++) {
    out = rings.map((r) => ({ ...r, points: simplifyRing(r.points, eps) }));
    if (pointCount(out) <= maxPoints) return out;
    eps *= 1.5;
  }
  return largestWithin(out, maxPoints);
}

export function ringsToShapes(rings, transform) {
  return rings.map(({ points, hole }) => {
    const mapped = [];
    for (let i = 0; i < points.length; i += 2) {
      const { x, y } = transform(points[i], points[i + 1]);
      mapped.push(x, y);
    }
    return { type: "polygon", points: mapped, hole };
  });
}

function fitScale(fit, w, h, imageWidth, imageHeight) {
  const rx = w / imageWidth;
  const ry = h / imageHeight;
  if (fit === "cover") return [Math.max(rx, ry), Math.max(rx, ry)];
  if (fit === "contain") return [Math.min(rx, ry), Math.min(rx, ry)];
  if (fit === "width") return [rx, rx];
  if (fit === "height") return [ry, ry];
  return [rx, ry];
}

export function imagePlacement(level, sceneRect, imageWidth, imageHeight) {
  const t = { anchorX: 0.5, anchorY: 0.5, offsetX: 0, offsetY: 0, fit: "fill", scaleX: 1, scaleY: 1, ...(level.textures ?? {}) };
  const [fx, fy] = fitScale(t.fit, sceneRect.width, sceneRect.height, imageWidth, imageHeight);
  const scaleX = fx * t.scaleX;
  const scaleY = fy * t.scaleY;
  const cx = sceneRect.x + sceneRect.width / 2 + t.offsetX;
  const cy = sceneRect.y + sceneRect.height / 2 + t.offsetY;
  return { x: cx - t.anchorX * scaleX * imageWidth, y: cy - t.anchorY * scaleY * imageHeight, scaleX, scaleY };
}

export function canTrace(level) {
  return !!level.background?.src && !(level.textures?.rotation ?? 0);
}

export function imageTransform(image, level, sceneRect) {
  const placement = imagePlacement(level, sceneRect, image.imageWidth, image.imageHeight);
  const sx = (image.imageWidth / image.width) * placement.scaleX;
  const sy = (image.imageHeight / image.height) * placement.scaleY;
  const transform = (x, y) => ({ x: placement.x + x * sx, y: placement.y + y * sy });
  return { transform, sx, sy };
}

export function traceFootprint(image, level, sceneRect, { epsilonScenePx = 4, maxPoints = 6000, fullCoverage = 0.98 } = {}) {
  const threshold = level.background?.alphaThreshold ?? 0.75;
  const { coverage, rings } = traceAlpha({ ...image, threshold });
  if (coverage >= fullCoverage || !rings.some((r) => !r.hole)) return null;
  const { transform, sx, sy } = imageTransform(image, level, sceneRect);
  const epsilon = epsilonScenePx / Math.max((sx + sy) / 2, 1e-6);
  return ringsToShapes(simplifyRings(rings, epsilon, maxPoints), transform);
}
