import { findLevel, isManaged, orderPair, stairStops as flagStops } from "./floor-plan.js";
import { holeAppendData, stairRemovalUpdates, stairsRemovalUpdates } from "./holes.js";
import { padShape, STAIR_OPENING_PAD } from "./shapes.js";
import { stairBandFor, stairLevelTags, stairStops } from "./regions.js";
import { behaviorStateUpdates, hasVariants, variantStairs, variantsOf } from "./states.js";

function findStair(plan, stairId) {
  return plan.levels.flatMap((e) => e.stairs).find((s) => s.id === stairId) ?? null;
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

function planAfterRemoval(plan, removals) {
  return { levels: plan.levels.map((e) => ({ ...e, surface: e.surface ? afterRemoval(e.surface, removals) : null })) };
}

function stairUpdate(stair, lower, upper, plan, removals) {
  const stops = stairStops(planAfterRemoval(plan, removals), lower, upper, stair.shapes);
  return {
    _id: stair.id,
    name: `Stair ${lower.name} ↔ ${upper.name}`,
    elevation: { ...stairBandFor(lower, upper), topInclusive: true },
    levels: stairLevelTags(lower, upper, stops),
    "flags.floorer.levelId": lower.id,
    "flags.floorer.targetLevelId": upper.id,
    "flags.floorer.stops": stops,
  };
}

export function stairPair(plan, stair) {
  const flag = stair.flags.floorer;
  const own = findLevel(plan, flag.levelId)?.level;
  const target = findLevel(plan, flag.targetLevelId)?.level;
  return own && target ? orderPair(own, target) : null;
}

export function stairSurfaces(plan, stair, removals = []) {
  const pair = stairPair(plan, stair);
  if (!pair) return [];
  const { lower, upper } = pair;
  const stops = stairStops(planAfterRemoval(plan, removals), lower, upper, stair.shapes);
  const ids = [...new Set([lower.id, ...stops, upper.id])];
  return ids
    .map((id) => managedSurface(findLevel(plan, id), removals))
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
    stair: stairUpdate(stair, lower, upper, plan, surfaceRemovals),
    surfaceRemovals,
    surfaceAdditions: stairOpeningUpdates(plan, nextStair, surfaceRemovals),
  };
}

function withTarget(stair, targetLevelId) {
  const floorer = { ...stair.flags.floorer, targetLevelId };
  return { ...stair, id: stair.id, shapes: stair.shapes, levels: stair.levels, elevation: stair.elevation, flags: { ...stair.flags, floorer } };
}

export function activeStair(plan, stair, activeId) {
  if (!hasVariants(stair)) return stair;
  const variant = variantsOf(stair)[activeId];
  const levelId = variant?.kind === "level" ? variant.levelId : null;
  const target = levelId && findLevel(plan, levelId) ? levelId : stair.flags.floorer.levelId;
  return withTarget(stair, target);
}

function strip(update) {
  const { ids, removed, ...rest } = update;
  return rest;
}

function mergeUpdate(list, update) {
  const next = strip(update);
  return [...list.filter((u) => u._id !== next._id), next];
}

function sameIds(a, b) {
  const left = new Set(a);
  return left.size === new Set(b).size && b.every((id) => left.has(id));
}

function sameBand(a, b) {
  return a?.bottom === b.bottom && a?.top === b.top && a?.topInclusive === b.topInclusive;
}

function stairPairData(plan, stair, removals) {
  const pair = stairPair(plan, stair);
  if (!pair) return null;
  const { lower, upper } = pair;
  const stops = stairStops(planAfterRemoval(plan, removals), lower, upper, stair.shapes);
  return {
    _id: stair.id,
    levels: stairLevelTags(lower, upper, stops),
    elevation: { ...stairBandFor(lower, upper), topInclusive: true },
    "flags.floorer.stops": stops,
  };
}

function settled(stair, data) {
  return sameIds(Array.from(stair.levels ?? []), data.levels) && sameBand(stair.elevation, data.elevation) && sameIds(flagStops(stair), data["flags.floorer.stops"]);
}

function stairPairUpdate(plan, stair, removals) {
  const data = stairPairData(plan, stair, removals);
  if (!data || settled(stair, data)) return null;
  return data;
}

export function stateApplyUpdates(plan, activeId) {
  const stairs = variantStairs(plan);
  const behaviors = stairs.map((stair) => ({ regionId: stair.id, updates: behaviorStateUpdates(stair, activeId) })).filter((e) => e.updates.length);
  if (!stairs.length) return { stairs: [], behaviors, surfaces: [] };
  let surfaces = stairsRemovalUpdates(plan, stairs.map((s) => s.id)).map(strip);
  const regions = [];
  for (const stair of stairs) {
    const active = activeStair(plan, stair, activeId);
    const update = stairPairUpdate(plan, active, surfaces);
    if (update) regions.push(update);
    for (const addition of stairOpeningUpdates(plan, active, surfaces)) surfaces = mergeUpdate(surfaces, addition);
  }
  return { stairs: regions, behaviors, surfaces };
}
