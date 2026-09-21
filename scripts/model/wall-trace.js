import { imageTransform } from "./trace.js";

const NEIGHBORS = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

export function darkMask({ width, height, data }, { threshold = 0.28, minAlpha = 0.5 } = {}) {
  const mask = new Uint8Array(width * height);
  const alphaCut = minAlpha * 255;
  const lumCut = threshold * 255;
  for (let i = 0; i < mask.length; i++) {
    const o = i * 4;
    if (data[o + 3] < alphaCut) continue;
    const lum = 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];
    if (lum <= lumCut) mask[i] = 1;
  }
  return mask;
}

function countOf(mask) {
  let n = 0;
  for (let i = 0; i < mask.length; i++) n += mask[i];
  return n;
}

function passRows(mask, width, height, radius, keep) {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let hits = 0;
      for (let dx = -radius; dx <= radius; dx++) {
        const xx = x + dx;
        if (xx >= 0 && xx < width && mask[row + xx]) hits++;
      }
      out[row + x] = keep(hits, 2 * radius + 1) ? 1 : 0;
    }
  }
  return out;
}

function passColumns(mask, width, height, radius, keep) {
  const out = new Uint8Array(width * height);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let hits = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy;
        if (yy >= 0 && yy < height && mask[yy * width + x]) hits++;
      }
      out[y * width + x] = keep(hits, 2 * radius + 1) ? 1 : 0;
    }
  }
  return out;
}

const ALL = (hits, size) => hits === size;
const ANY = (hits) => hits > 0;

function erode(mask, width, height, radius) {
  return passColumns(passRows(mask, width, height, radius, ALL), width, height, radius, ALL);
}

function dilate(mask, width, height, radius) {
  return passColumns(passRows(mask, width, height, radius, ANY), width, height, radius, ANY);
}

export function openMask(mask, width, height, radius) {
  if (!(radius > 0)) return Uint8Array.from(mask);
  return dilate(erode(mask, width, height, radius), width, height, radius);
}

function at(mask, width, height, x, y) {
  return x >= 0 && y >= 0 && x < width && y < height ? mask[y * width + x] : 0;
}

function ring(mask, width, height, x, y) {
  return NEIGHBORS.map(([dx, dy]) => at(mask, width, height, x + dx, y + dy));
}

function transitions(p) {
  let n = 0;
  for (let i = 0; i < 8; i++) if (p[i] === 0 && p[(i + 1) % 8] === 1) n++;
  return n;
}

function sum(p) {
  return p.reduce((a, b) => a + b, 0);
}

function removable(p, pass) {
  const b = sum(p);
  if (b < 2 || b > 6 || transitions(p) !== 1) return false;
  return pass === 0 ? p[0] * p[2] * p[4] === 0 && p[2] * p[4] * p[6] === 0 : p[0] * p[2] * p[6] === 0 && p[0] * p[4] * p[6] === 0;
}

function thinPass(skel, width, height, pass) {
  const doomed = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (skel[y * width + x] && removable(ring(skel, width, height, x, y), pass)) doomed.push(y * width + x);
    }
  }
  for (const i of doomed) skel[i] = 0;
  return doomed.length;
}

export function thin(mask, width, height) {
  const skel = Uint8Array.from(mask);
  let changed = 1;
  while (changed > 0) changed = thinPass(skel, width, height, 0) + thinPass(skel, width, height, 1);
  return skel;
}

function neighborsOf(skel, width, height, x, y) {
  const out = [];
  for (const [dx, dy] of NEIGHBORS) {
    if (at(skel, width, height, x + dx, y + dy)) out.push([x + dx, y + dy]);
  }
  return out;
}

function branches(skel, width, height) {
  const deg = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (skel[y * width + x]) deg[y * width + x] = transitions(ring(skel, width, height, x, y));
    }
  }
  return deg;
}

function walker(skel, width, height, deg, visited) {
  const index = ([x, y]) => y * width + x;
  const isNode = (p) => deg[index(p)] !== 2;
  const same = (a, b) => a[0] === b[0] && a[1] === b[1];
  const closes = (line, p) => same(p, line[0]) && line.length > 2;
  const eligible = (line, p) => (isNode(p) ? closes(line, p) || !same(p, line[0]) : closes(line, p) || !visited[index(p)]);
  const rank = (cur, p) => Math.abs(p[0] - cur[0]) + Math.abs(p[1] - cur[1]) + (isNode(p) ? 0.5 : 0);
  const next = (line) => {
    const cur = line[line.length - 1];
    const prev = line[line.length - 2];
    const options = neighborsOf(skel, width, height, cur[0], cur[1]).filter((p) => !same(p, prev) && eligible(line, p));
    return options.sort((a, b) => rank(cur, a) - rank(cur, b))[0] ?? null;
  };
  return (start, first) => {
    const line = [start, first];
    visited[index(first)] = 1;
    for (;;) {
      const p = next(line);
      if (!p) return line;
      line.push(p);
      if (isNode(p) || visited[index(p)]) return line;
      visited[index(p)] = 1;
    }
  };
}

function eachPixel(skel, width, height, fn) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (skel[y * width + x]) fn(x, y, y * width + x);
    }
  }
}

export function skeletonToPolylines(skel, width, height) {
  const deg = branches(skel, width, height);
  const visited = new Uint8Array(width * height);
  const walk = walker(skel, width, height, deg, visited);
  const lines = [];
  eachPixel(skel, width, height, (x, y, i) => {
    if (deg[i] === 2) return;
    for (const n of neighborsOf(skel, width, height, x, y)) {
      const j = n[1] * width + n[0];
      if (deg[j] === 2 && !visited[j]) lines.push(walk([x, y], n));
    }
  });
  eachPixel(skel, width, height, (x, y, i) => {
    if (deg[i] !== 2 || visited[i]) return;
    visited[i] = 1;
    lines.push(walk([x, y], neighborsOf(skel, width, height, x, y)[0]));
  });
  return lines;
}

function pointSegmentDistance([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function douglasPeucker(points, first, last, epsilon, keep) {
  let maxDist = -1;
  let index = -1;
  for (let i = first + 1; i < last; i++) {
    const d = pointSegmentDistance(points[i], points[first], points[last]);
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

export function simplifyPolyline(points, epsilon) {
  if (points.length <= 2) return points;
  const keep = new Set([0, points.length - 1]);
  douglasPeucker(points, 0, points.length - 1, epsilon, keep);
  return Array.from(keep)
    .sort((a, b) => a - b)
    .map((i) => points[i]);
}

export function polylineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return total;
}

export function traceInteriorWalls(image, { threshold = 0.45, minLength = 10, epsilon = 1.5, thicknessPx = 0 } = {}) {
  const { width, height } = image;
  const mask = darkMask(image, { threshold });
  const opened = openMask(mask, width, height, Math.round(thicknessPx / 2));
  const stats = { maskPixels: countOf(mask), afterOpen: countOf(opened) };
  const polylines = skeletonToPolylines(thin(opened, width, height), width, height)
    .map((line) => simplifyPolyline(line, epsilon))
    .filter((line) => polylineLength(line) >= minLength);
  return { polylines, stats };
}

export function polylinesToSegments(polylines, transform) {
  return polylines.flatMap((line) => {
    const out = [];
    for (let i = 1; i < line.length; i++) {
      const a = transform(line[i - 1][0], line[i - 1][1]);
      const b = transform(line[i][0], line[i][1]);
      const seg = [a.x, a.y, b.x, b.y].map(Math.round);
      if (seg[0] !== seg[2] || seg[1] !== seg[3]) out.push(seg);
    }
    return out;
  });
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

export function traceWallSegments({ image, level, sceneRect, gridSize, outline }, { threshold, minSquares, thickness = 0, epsilon = 1.5 }) {
  const { transform, sx, sy } = imageTransform(image, level, sceneRect);
  const pxPerSquare = gridSize / ((sx + sy) / 2);
  const { polylines, stats } = traceInteriorWalls(image, { threshold, minLength: minSquares * pxPerSquare, thicknessPx: thickness * pxPerSquare, epsilon });
  return { segments: withoutOutline(polylinesToSegments(polylines, transform), outline), stats };
}
