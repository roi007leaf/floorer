import { ROLES } from "../constants.js";

export function floorerFlag(doc) {
  return doc?.flags?.floorer;
}

export function isManaged(doc) {
  const f = floorerFlag(doc);
  return !!f && f.managed !== false;
}

function bottomOf(level) {
  return level.elevation?.bottom ?? -Infinity;
}

function toArray(collection) {
  return collection ? Array.from(collection) : [];
}

function visibilityIds(level) {
  return toArray(level.visibility?.levels);
}

export function surfaceLevels(level, allLevels) {
  const ids = new Set([level.id]);
  for (const other of allLevels) {
    if (visibilityIds(other).includes(level.id)) ids.add(other.id);
  }
  return [...ids];
}

export function orderPair(a, b) {
  return bottomOf(a) <= bottomOf(b) ? { lower: a, upper: b } : { lower: b, upper: a };
}

function emptyFloorLevel(level) {
  return { level, surface: null, stairs: [], managed: isManaged(level), below: null, above: null };
}

function attachRegions(byLevel, regions) {
  for (const region of regions) {
    const flag = floorerFlag(region);
    const entry = flag && byLevel.get(flag.levelId);
    if (!entry) continue;
    if (flag.role === ROLES.SURFACE) entry.surface = region;
    else if (flag.role === ROLES.STAIR) entry.stairs.push(region);
  }
}

function linkNeighbours(levels) {
  levels.forEach((entry, i) => {
    entry.below = levels[i - 1] ?? null;
    entry.above = levels[i + 1] ?? null;
  });
}

export function buildFloorPlan(scene) {
  const sorted = toArray(scene.levels).sort((a, b) => bottomOf(a) - bottomOf(b));
  const levels = sorted.map(emptyFloorLevel);
  const byLevel = new Map(levels.map((e) => [e.level.id, e]));
  attachRegions(byLevel, toArray(scene.regions));
  linkNeighbours(levels);
  return { scene, levels };
}

export function findLevel(plan, id) {
  return plan.levels.find((e) => e.level.id === id);
}
