import { findLevel, isManaged, orderPair, shaftLevels, shaftOf } from "./floor-plan.js";
import { holeAppendData, stairRemovalUpdates } from "./holes.js";
import { padShape, STAIR_OPENING_PAD } from "./shapes.js";

function findStair(plan, stairId) {
  return plan.levels.flatMap((e) => e.stairs).find((s) => s.id === stairId) ?? null;
}

function allLevels(plan) {
  return plan.levels.map((e) => e.level);
}

function stairUpdate(stair, lower, upper, plan) {
  const shaft = shaftOf(lower, upper, allLevels(plan));
  return {
    _id: stair.id,
    name: `Stair ${lower.name} ↔ ${upper.name}`,
    elevation: { ...shaft.band, topInclusive: true },
    levels: shaft.levels,
    "flags.floorer.levelId": lower.id,
    "flags.floorer.targetLevelId": upper.id,
    "flags.floorer.stops": shaft.stops,
  };
}

function afterRemoval(surface, removals) {
  const removal = removals.find((u) => u._id === surface.id);
  if (!removal) return surface;
  const floorer = { ...surface.flags.floorer, holes: removal["flags.floorer.holes"] };
  return { ...surface, id: surface.id, _id: surface.id, shapes: removal.shapes, flags: { ...surface.flags, floorer } };
}

function managedSurface(entry, removals) {
  const surface = entry?.surface;
  return surface && isManaged(surface) ? afterRemoval(surface, removals) : null;
}

export function stairSurfaces(plan, stair, removals = []) {
  const flag = stair.flags.floorer;
  const fromEntry = findLevel(plan, flag.levelId);
  const targetEntry = findLevel(plan, flag.targetLevelId);
  if (!fromEntry || !targetEntry) return [];
  const { lower, upper } = orderPair(fromEntry.level, targetEntry.level);
  return shaftLevels(lower, upper, allLevels(plan))
    .map((l) => managedSurface(findLevel(plan, l.id), removals))
    .filter(Boolean)
    .reverse();
}

export function stairOpeningShapes(stair) {
  return Array.from(stair.shapes ?? []).map((s) => padShape(s, STAIR_OPENING_PAD));
}

function additions(surfaces, shapes, extra) {
  const [origin, ...rest] = surfaces;
  if (!origin) return [];
  const originUpdate = holeAppendData(origin, shapes, { extra });
  return [originUpdate, ...rest.map((s) => holeAppendData(s, shapes, { mirrorOf: originUpdate.ids, extra }))];
}

export function stairOpeningUpdates(plan, stair, removals = []) {
  return additions(stairSurfaces(plan, stair, removals), stairOpeningShapes(stair), { stairId: stair.id });
}

export function stairRetargetUpdates(plan, stairId, fromLevelId, newTargetLevelId) {
  const stair = findStair(plan, stairId);
  const from = findLevel(plan, fromLevelId);
  const target = findLevel(plan, newTargetLevelId);
  if (!stair || !from || !target || from === target) return null;
  const current = stair.flags.floorer;
  if (target.level.id === (current.levelId === from.level.id ? current.targetLevelId : current.levelId)) return null;
  const { lower, upper } = orderPair(from.level, target.level);
  const surfaceRemovals = stairRemovalUpdates(plan, stairId);
  const nextStair = { ...stair, flags: { ...stair.flags, floorer: { ...current, levelId: lower.id, targetLevelId: upper.id } } };
  return {
    stair: stairUpdate(stair, lower, upper, plan),
    surfaceRemovals,
    surfaceAdditions: stairOpeningUpdates(plan, nextStair, surfaceRemovals),
  };
}
