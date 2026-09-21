import { bandOf, findLevel, finiteOrNull, isManaged, orderPair, shaftOf, stairStops, surfaceLevels } from "./floor-plan.js";
import { holeAppendData } from "./holes.js";
import { bandChangeUpdates, bandGaps } from "./band-edit.js";
import { stairOpeningShapes, stairOpeningUpdates, stairSurfaces } from "./stair-retarget.js";

export function sameSet(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every((x) => sb.has(x));
}

function sameBand(elevation, want) {
  return finiteOrNull(elevation?.bottom) === want.bottom && finiteOrNull(elevation?.top) === want.top && elevation?.topInclusive === true;
}

function bandData(id, band) {
  return { _id: id, elevation: { ...band, topInclusive: true } };
}

function issue(id, levelId, docId, fix, severity = "warning") {
  return { id, levelId, docId, label: `FLOORER.Issue.${id}`, fix, severity };
}

function surfaceIssues(entry, allLevels) {
  const out = [];
  const level = entry.level;
  if (!entry.surface) return [issue("surface-missing", level.id, null, { intent: "footprint", levelId: level.id })];
  const s = entry.surface;
  if (!isManaged(s)) return [];
  const want = surfaceLevels(level, allLevels);
  if (!sameSet(s.levels, want)) out.push(issue("surface-levels", level.id, s.id, { collection: "regions", op: "update", data: { _id: s.id, levels: want } }));
  if (!sameBand(s.elevation, bandOf(level))) out.push(issue("surface-band", level.id, s.id, { collection: "regions", op: "update", data: bandData(s.id, bandOf(level)) }));
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
    if (h.stairId || h.mirrorOf || done.has(h.id) || !shapes[i]) return [];
    const data = holeAppendData(below.surface, [shapes[i]], { mirrorOf: [h.id] });
    return [issue("hole-unmirrored", entry.level.id, entry.surface.id, { collection: "regions", op: "update", data })];
  });
}

function stairTagFix(stair, shaft) {
  return { collection: "regions", op: "update", data: { _id: stair.id, levels: shaft.levels, "flags.floorer.stops": shaft.stops } };
}

function stairIssues(entry, plan, allLevels) {
  return entry.stairs.flatMap((stair) => {
    if (!isManaged(stair)) return [];
    const target = findLevel(plan, stair.flags.floorer.targetLevelId);
    if (!target) return [issue("stair-target-missing", entry.level.id, stair.id, { prompt: "stair-target", docId: stair.id })];
    const { lower, upper } = orderPair(entry.level, target.level);
    const shaft = shaftOf(lower, upper, allLevels);
    const out = [];
    if (!sameSet(stair.levels, shaft.levels) || !sameSet(stairStops(stair), shaft.stops)) out.push(issue("stair-levels", entry.level.id, stair.id, stairTagFix(stair, shaft)));
    if (!sameBand(stair.elevation, shaft.band)) out.push(issue("stair-band", entry.level.id, stair.id, { collection: "regions", op: "update", data: bandData(stair.id, shaft.band) }));
    return out;
  });
}

function stairHoleFor(surface, stairId) {
  const holes = surface.flags?.floorer?.holes ?? [];
  return holes.find((h) => h.stairId === stairId) ?? null;
}

function updateFix([data, ...cascade]) {
  return { collection: "regions", op: "update", data, cascade };
}

function missingOpenings(surfaces, holes, stair) {
  const shapes = stairOpeningShapes(stair);
  const origin = holes[0];
  const extra = { stairId: stair.id };
  return surfaces.flatMap((s, i) => (holes[i] ? [] : [holeAppendData(s, shapes, { mirrorOf: origin ? shapes.map(() => origin.id) : undefined, extra })]));
}

function stairOpeningFix(stair, plan) {
  const surfaces = stairSurfaces(plan, stair);
  const holes = surfaces.map((s) => stairHoleFor(s, stair.id));
  if (!surfaces.length || holes.every(Boolean)) return null;
  if (holes.every((h) => !h)) return updateFix(stairOpeningUpdates(plan, stair));
  return updateFix(missingOpenings(surfaces, holes, stair));
}

function stairOpeningIssues(entry, plan) {
  return entry.stairs.flatMap((stair) => {
    if (!isManaged(stair)) return [];
    const fix = stairOpeningFix(stair, plan);
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
      if (overlaps(managed[i].level, managed[j].level)) out.push(issue("level-overlap", managed[i].level.id, managed[j].level.id, null, "info"));
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
  const perLevel = plan.levels.filter((e) => e.managed).flatMap((e) => [...surfaceIssues(e, allLevels), ...holeIssues(e), ...stairIssues(e, plan, allLevels), ...stairOpeningIssues(e, plan)]);
  return [...perLevel, ...overlapIssues(plan), ...gapIssues(plan)];
}
