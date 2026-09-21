import { bandOf, findLevel, finiteOrNull, isManaged, orderPair, surfaceLevels } from "./floor-plan.js";
import { holeAppendData } from "./holes.js";

export function sameSet(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every((x) => sb.has(x));
}

function sameBand(elevation, level) {
  const want = bandOf(level);
  return finiteOrNull(elevation?.bottom) === want.bottom && finiteOrNull(elevation?.top) === want.top && elevation?.topInclusive === true;
}

function bandData(id, level) {
  return { _id: id, elevation: { ...bandOf(level), topInclusive: true } };
}

function issue(id, levelId, docId, fix) {
  return { id, levelId, docId, label: `FLOORER.Issue.${id}`, fix };
}

function surfaceIssues(entry, allLevels) {
  const out = [];
  const level = entry.level;
  if (!entry.surface) return [issue("surface-missing", level.id, null, { intent: "footprint", levelId: level.id })];
  const s = entry.surface;
  if (!isManaged(s)) return [];
  const want = surfaceLevels(level, allLevels);
  if (!sameSet(s.levels, want)) out.push(issue("surface-levels", level.id, s.id, { collection: "regions", op: "update", data: { _id: s.id, levels: want } }));
  if (!sameBand(s.elevation, level)) out.push(issue("surface-band", level.id, s.id, { collection: "regions", op: "update", data: bandData(s.id, level) }));
  return out;
}

function holeShapes(surface) {
  const shapes = Array.from(surface.shapes ?? []);
  return shapes.filter((sh) => (typeof sh.toObject === "function" ? sh.toObject() : sh).hole);
}

function mirroredIds(surface) {
  return new Set((surface.flags?.floorer?.holes ?? []).map((h) => h.mirrorOf).filter(Boolean));
}

function holeIssues(entry) {
  const below = entry.below;
  if (!entry.surface || !isManaged(entry.surface) || !below?.surface || !isManaged(below.surface)) return [];
  const holes = entry.surface.flags?.floorer?.holes ?? [];
  const shapes = holeShapes(entry.surface);
  const done = mirroredIds(below.surface);
  return holes.flatMap((h, i) => {
    if (h.mirrorOf || done.has(h.id) || !shapes[i]) return [];
    const data = holeAppendData(below.surface, [shapes[i]], { mirrorOf: [h.id] });
    return [issue("hole-unmirrored", entry.level.id, entry.surface.id, { collection: "regions", op: "update", data })];
  });
}

function stairIssues(entry, plan) {
  return entry.stairs.flatMap((stair) => {
    if (!isManaged(stair)) return [];
    const flag = stair.flags.floorer;
    const target = findLevel(plan, flag.targetLevelId);
    if (!target) return [issue("stair-target-missing", entry.level.id, stair.id, { prompt: "stair-target", docId: stair.id })];
    const { lower, upper } = orderPair(entry.level, target.level);
    const out = [];
    if (!sameSet(stair.levels, [lower.id, upper.id])) out.push(issue("stair-levels", entry.level.id, stair.id, { collection: "regions", op: "update", data: { _id: stair.id, levels: [lower.id, upper.id] } }));
    if (!sameBand(stair.elevation, lower)) out.push(issue("stair-band", entry.level.id, stair.id, { collection: "regions", op: "update", data: bandData(stair.id, lower) }));
    return out;
  });
}

function overlaps(a, b) {
  const ba = bandOf(a);
  const bb = bandOf(b);
  return (ba.bottom ?? -Infinity) < (bb.top ?? Infinity) && (bb.bottom ?? -Infinity) < (ba.top ?? Infinity);
}

function overlapIssues(plan) {
  const managed = plan.levels.filter((e) => e.managed);
  const out = [];
  for (let i = 0; i < managed.length; i++) {
    for (let j = i + 1; j < managed.length; j++) {
      if (overlaps(managed[i].level, managed[j].level)) out.push(issue("level-overlap", managed[i].level.id, managed[j].level.id, null));
    }
  }
  return out;
}

export function lint(plan) {
  const allLevels = plan.levels.map((e) => e.level);
  const perLevel = plan.levels.filter((e) => e.managed).flatMap((e) => [...surfaceIssues(e, allLevels), ...holeIssues(e), ...stairIssues(e, plan)]);
  return [...perLevel, ...overlapIssues(plan)];
}
