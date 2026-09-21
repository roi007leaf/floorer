import { imageTransform } from "./trace.js";

const DEG = Math.PI / 180;
const PARALLEL_COS = Math.cos(3 * DEG);

export function grayscale({ width, height, data }, { minAlpha = 0.5 } = {}) {
  const gray = new Float32Array(width * height);
  const alphaCut = minAlpha * 255;
  for (let i = 0; i < gray.length; i++) {
    const o = i * 4;
    gray[i] = data[o + 3] < alphaCut ? 1 : (0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]) / 255;
  }
  return gray;
}

function sobelAt(gray, w, i) {
  const tl = gray[i - w - 1];
  const tr = gray[i - w + 1];
  const bl = gray[i + w - 1];
  const br = gray[i + w + 1];
  const gx = tr + 2 * gray[i + 1] + br - tl - 2 * gray[i - 1] - bl;
  const gy = bl + 2 * gray[i + w] + br - tl - 2 * gray[i - w] - tr;
  return Math.min(1, Math.hypot(gx, gy) / 4);
}

export function sobelEdges(gray, w, h) {
  const mag = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) mag[y * w + x] = sobelAt(gray, w, y * w + x);
  }
  return mag;
}

export function edgeMask(mag, threshold) {
  const mask = new Uint8Array(mag.length);
  for (let i = 0; i < mag.length; i++) if (mag[i] >= threshold) mask[i] = 1;
  return mask;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledEdges(mask, seed) {
  const order = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) order.push(i);
  const rand = mulberry32(seed);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

function angleTable(angleStep) {
  const count = Math.max(1, Math.round(180 / angleStep));
  const cos = new Float64Array(count);
  const sin = new Float64Array(count);
  for (let t = 0; t < count; t++) {
    cos[t] = Math.cos(t * angleStep * DEG);
    sin[t] = Math.sin(t * angleStep * DEG);
  }
  return { count, cos, sin };
}

function accumulator(w, h, angles) {
  const rhoMax = Math.ceil(Math.hypot(w, h));
  const rhoBins = 2 * rhoMax + 1;
  return { acc: new Int32Array(angles.count * rhoBins), rhoMax, rhoBins, angles };
}

function vote({ acc, rhoMax, rhoBins, angles }, x, y, delta) {
  let best = { t: 0, count: -1 };
  for (let t = 0; t < angles.count; t++) {
    const idx = t * rhoBins + Math.round(x * angles.cos[t] + y * angles.sin[t]) + rhoMax;
    acc[idx] += delta;
    if (acc[idx] > best.count) best = { t, count: acc[idx] };
  }
  return best;
}

function walkDirection(live, w, h, x0, y0, dx, dy, sign, maxGap) {
  const xMajor = Math.abs(dx) >= Math.abs(dy);
  const slope = xMajor ? dy / dx : dx / dy;
  const step = sign * Math.sign(xMajor ? dx : dy);
  const pixels = [];
  let end = [x0, y0];
  for (let k = 1, gap = 0; gap <= maxGap; k++) {
    const m = k * step;
    const x = xMajor ? x0 + m : Math.round(x0 + m * slope);
    const y = xMajor ? Math.round(y0 + m * slope) : y0 + m;
    if (x < 0 || y < 0 || x >= w || y >= h) break;
    if (!live[y * w + x]) {
      gap++;
      continue;
    }
    gap = 0;
    end = [x, y];
    pixels.push(y * w + x);
  }
  return { pixels, end };
}

function walk(live, w, h, x, y, cos, sin, maxGap) {
  const a = walkDirection(live, w, h, x, y, -sin, cos, 1, maxGap);
  const b = walkDirection(live, w, h, x, y, -sin, cos, -1, maxGap);
  const pixels = [y * w + x, ...a.pixels, ...b.pixels];
  return { pixels, segment: [b.end[0], b.end[1], a.end[0], a.end[1]], length: Math.hypot(a.end[0] - b.end[0], a.end[1] - b.end[1]) };
}

function refined(live, w, h, x, y, run, maxGap) {
  if (run.length < 2) return run;
  const [x1, y1, x2, y2] = run.segment;
  const again = walk(live, w, h, x, y, (y2 - y1) / run.length, (x1 - x2) / run.length, maxGap);
  return again.length > run.length ? again : run;
}

function longestRun(live, w, h, x, y, cos, sin, maxGap) {
  let run = walk(live, w, h, x, y, cos, sin, maxGap);
  for (let i = 0; i < 2; i++) run = refined(live, w, h, x, y, run, maxGap);
  return run;
}

function clearRun(live, voted, space, w, pixels) {
  for (const i of pixels) {
    if (!live[i]) continue;
    live[i] = 0;
    if (voted[i]) vote(space, i % w, Math.floor(i / w), -1);
  }
}

export function houghSegments(mask, w, h, { minLength = 10, maxGap = 3, angleStep = 1, votes, seed = 1 } = {}) {
  const live = Uint8Array.from(mask);
  const voted = new Uint8Array(w * h);
  const space = accumulator(w, h, angleTable(angleStep));
  const threshold = votes ?? Math.max(8, Math.round(minLength / 2));
  const out = [];
  for (const i of shuffledEdges(mask, seed)) {
    if (!live[i]) continue;
    const x = i % w;
    const y = Math.floor(i / w);
    const best = vote(space, x, y, 1);
    voted[i] = 1;
    if (best.count < threshold) continue;
    const run = longestRun(live, w, h, x, y, space.angles.cos[best.t], space.angles.sin[best.t], maxGap);
    clearRun(live, voted, space, w, run.pixels);
    if (run.length >= minLength) out.push(run.segment);
  }
  return out;
}

function segmentInfo([x1, y1, x2, y2]) {
  const length = Math.hypot(x2 - x1, y2 - y1);
  return { x1, y1, x2, y2, length, ux: (x2 - x1) / length, uy: (y2 - y1) / length };
}

function alongAcross(a, x, y) {
  return { along: (x - a.x1) * a.ux + (y - a.y1) * a.uy, across: Math.abs((x - a.x1) * -a.uy + (y - a.y1) * a.ux) };
}

function mergeable(a, b, gap) {
  if (Math.abs(a.ux * b.ux + a.uy * b.uy) < PARALLEL_COS) return false;
  const p = alongAcross(a, b.x1, b.y1);
  const q = alongAcross(a, b.x2, b.y2);
  if (p.across > gap || q.across > gap) return false;
  return Math.max(p.along, q.along) >= -gap && Math.min(p.along, q.along) <= a.length + gap;
}

function merged(a, b) {
  const flip = a.ux * b.ux + a.uy * b.uy < 0 ? -1 : 1;
  const total = a.length + b.length;
  const vx = a.length * a.ux + flip * b.length * b.ux;
  const vy = a.length * a.uy + flip * b.length * b.uy;
  const norm = Math.hypot(vx, vy);
  const ux = vx / norm;
  const uy = vy / norm;
  const cx = (a.length * (a.x1 + a.x2) + b.length * (b.x1 + b.x2)) / (2 * total);
  const cy = (a.length * (a.y1 + a.y2) + b.length * (b.y1 + b.y2)) / (2 * total);
  const ts = [
    [a.x1, a.y1],
    [a.x2, a.y2],
    [b.x1, b.y1],
    [b.x2, b.y2],
  ].map(([x, y]) => (x - cx) * ux + (y - cy) * uy);
  const lo = Math.min(...ts);
  const hi = Math.max(...ts);
  return segmentInfo([cx + lo * ux, cy + lo * uy, cx + hi * ux, cy + hi * uy]);
}

function absorb(cur, items, used, from, gap) {
  let changed = true;
  while (changed) {
    changed = false;
    for (let j = from; j < items.length; j++) {
      if (used[j] || !mergeable(cur, items[j], gap)) continue;
      cur = merged(cur, items[j]);
      used[j] = 1;
      changed = true;
    }
  }
  return cur;
}

export function mergeParallel(segments, gap) {
  const items = segments
    .map(segmentInfo)
    .filter((s) => s.length > 0)
    .sort((a, b) => b.length - a.length);
  const used = new Uint8Array(items.length);
  const out = [];
  for (let i = 0; i < items.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const cur = absorb(items[i], items, used, i + 1, gap);
    out.push([cur.x1, cur.y1, cur.x2, cur.y2]);
  }
  return out;
}

function countOf(mask) {
  let n = 0;
  for (let i = 0; i < mask.length; i++) n += mask[i];
  return n;
}

export function traceInteriorWalls(image, { edgeStrength = 0.35, minLength = 10, mergeGap = 4 } = {}) {
  const { width, height } = image;
  const mask = edgeMask(sobelEdges(grayscale(image), width, height), edgeStrength);
  const raw = houghSegments(mask, width, height, { minLength });
  const segments = mergeParallel(raw, mergeGap).filter(([x1, y1, x2, y2]) => Math.hypot(x2 - x1, y2 - y1) >= minLength);
  return { segments, stats: { edgePixels: countOf(mask), rawSegments: raw.length } };
}

export function segmentsToScene(segments, transform) {
  const out = [];
  for (const [x1, y1, x2, y2] of segments) {
    const a = transform(x1, y1);
    const b = transform(x2, y2);
    const seg = [a.x, a.y, b.x, b.y].map(Math.round);
    if (seg[0] !== seg[2] || seg[1] !== seg[3]) out.push(seg);
  }
  return out;
}

function pointSegmentDistance([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function nearSegment(point, seg, tol) {
  return pointSegmentDistance(point, [seg[0], seg[1]], [seg[2], seg[3]]) <= tol;
}

export function withoutOutline(segments, outline, tol = 6) {
  return segments.filter((s) => {
    const mid = [(s[0] + s[2]) / 2, (s[1] + s[3]) / 2];
    return !outline.some((o) => nearSegment(mid, o, tol));
  });
}

export function previewSvgLines(segments) {
  return segments.map(([x1, y1, x2, y2]) => ({ x1, y1, x2, y2 }));
}

export function segmentsBounds(segments) {
  if (!segments.length) return null;
  const xs = segments.flatMap(([x1, , x2]) => [x1, x2]);
  const ys = segments.flatMap(([, y1, , y2]) => [y1, y2]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

export function viewFit(rect, screen, { margin = 0.85, minScale = 0.15, maxScale = 3 } = {}) {
  const fit = margin * Math.min(screen.width / Math.max(rect.width, 1), screen.height / Math.max(rect.height, 1));
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, scale: Math.min(maxScale, Math.max(minScale, fit)) };
}

export function traceWallSegments({ image, level, sceneRect, gridSize, outline }, { edgeStrength, minSquares }) {
  const { transform, sx, sy } = imageTransform(image, level, sceneRect);
  const pxPerSquare = gridSize / ((sx + sy) / 2);
  const { segments, stats } = traceInteriorWalls(image, { edgeStrength, minLength: minSquares * pxPerSquare, mergeGap: 0.4 * pxPerSquare });
  return { segments: withoutOutline(segmentsToScene(segments, transform), outline), stats };
}
