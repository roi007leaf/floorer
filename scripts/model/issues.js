import { bandOf, findLevel, finiteOrNull, isManaged, orderPair, surfaceLevels } from "./floor-plan.js";
import { holeAppendData } from "./holes.js";
import { bandChangeUpdates, bandGaps } from "./band-edit.js";
import { stairOpeningUpdates } from "./stair-retarget.js";
import { padShape, STAIR_OPENING_PAD } from "./shapes.js";

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

function stairHoleFor(surface, stairId) {
  const holes = surface.flags?.floorer?.holes ?? [];
  return holes.find((h) => h.stairId === stairId) ?? null;
}

function stairOpeningFix(entry, stair, plan) {
  const flag = stair.flags.floorer;
  const target = findLevel(plan, flag.targetLevelId);
  if (!target) return null;
  const { lower, upper } = orderPair(entry.level, target.level);
  const lowerEntry = findLevel(plan, lower.id);
  const upperEntry = findLevel(plan, upper.id);
  const lowerSurface = lowerEntry?.surface && isManaged(lowerEntry.surface) ? lowerEntry.surface : null;
  const upperSurface = upperEntry?.surface && isManaged(upperEntry.surface) ? upperEntry.surface : null;
  if (!lowerSurface && !upperSurface) return null;
  const lowerHole = lowerSurface ? stairHoleFor(lowerSurface, stair.id) : null;
  const upperHole = upperSurface ? stairHoleFor(upperSurface, stair.id) : null;
  if ((!lowerSurface || lowerHole) && (!upperSurface || upperHole)) return null;
  const shapes = Array.from(stair.shapes ?? []).map((s) => padShape(s, STAIR_OPENING_PAD));
  if (!lowerHole && !upperHole) {
    const [data, ...cascade] = stairOpeningUpdates(plan, stair);
    return { collection: "regions", op: "update", data, cascade };
  }
  if (!lowerHole && lowerSurface) {
    const data = holeAppendData(lowerSurface, shapes, { mirrorOf: shapes.map(() => upperHole.id), extra: { stairId: stair.id } });
    return { collection: "regions", op: "update", data, cascade: [] };
  }
  const data = holeAppendData(upperSurface, shapes, { extra: { stairId: stair.id } });
  return { collection: "regions", op: "update", data, cascade: [] };
}

function stairOpeningIssues(entry, plan) {
  return entry.stairs.flatMap((stair) => {
    if (!isManaged(stair)) return [];
    const fix = stairOpeningFix(entry, stair, plan);
    return fix ? [issue("stair-openings", entry.level.id, stair.id, fix)] : [];
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

function gapFix(plan, { lowerId, upperId }) {
  const lower = bandOf(findLevel(plan, lowerId).level);
  const upper = bandOf(findLevel(plan, upperId).level);
  const band = { bottom: lower.top, top: upper.top };
  const { regions } = bandChangeUpdates(plan, upperId, band);
  return { collection: "levels", op: "update", data: { _id: upperId, elevation: band }, cascade: regions };
}

function gapIssues(plan) {
  return bandGaps(plan).map((gap) => issue("level-gap", gap.upperId, gap.lowerId, gapFix(plan, gap)));
}

export function lint(plan) {
  const allLevels = plan.levels.map((e) => e.level);
  const perLevel = plan.levels.filter((e) => e.managed).flatMap((e) => [...surfaceIssues(e, allLevels), ...holeIssues(e), ...stairIssues(e, plan), ...stairOpeningIssues(e, plan)]);
  return [...perLevel, ...overlapIssues(plan), ...gapIssues(plan)];
}
