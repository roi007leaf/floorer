import { bandOf, findLevel, isManaged, orderPair } from "./floor-plan.js";
import { holeAppendData, stairRemovalUpdates } from "./holes.js";

function findStair(plan, stairId) {
  return plan.levels.flatMap((e) => e.stairs).find((s) => s.id === stairId) ?? null;
}

function stairUpdate(stair, lower, upper) {
  return {
    _id: stair.id,
    name: `Stair ${lower.name} ↔ ${upper.name}`,
    elevation: { ...bandOf(lower), topInclusive: true },
    levels: [lower.id, upper.id],
    "flags.floorer.levelId": lower.id,
    "flags.floorer.targetLevelId": upper.id,
  };
}

function afterRemoval(surface, removals) {
  const removal = removals.find((u) => u._id === surface.id);
  if (!removal) return surface;
  const floorer = { ...surface.flags.floorer, holes: removal["flags.floorer.holes"] };
  return { ...surface, shapes: removal.shapes, flags: { ...surface.flags, floorer } };
}

function managedSurface(entry, removals) {
  const surface = entry.surface;
  return surface && isManaged(surface) ? afterRemoval(surface, removals) : null;
}

function additions(lowerEntry, upperEntry, shapes, removals, extra) {
  const lower = managedSurface(lowerEntry, removals);
  const upper = managedSurface(upperEntry, removals);
  if (!upper) return lower ? [holeAppendData(lower, shapes, { extra })] : [];
  const upperUpdate = holeAppendData(upper, shapes, { extra });
  if (!lower) return [upperUpdate];
  return [upperUpdate, holeAppendData(lower, shapes, { mirrorOf: upperUpdate.ids, extra })];
}

export function stairRetargetUpdates(plan, stairId, fromLevelId, newTargetLevelId) {
  const stair = findStair(plan, stairId);
  const from = findLevel(plan, fromLevelId);
  const target = findLevel(plan, newTargetLevelId);
  if (!stair || !from || !target || from === target) return null;
  const { lower, upper } = orderPair(from.level, target.level);
  const [lowerEntry, upperEntry] = [findLevel(plan, lower.id), findLevel(plan, upper.id)];
  const surfaceRemovals = stairRemovalUpdates(plan, stairId);
  return {
    stair: stairUpdate(stair, lower, upper),
    surfaceRemovals,
    surfaceAdditions: additions(lowerEntry, upperEntry, Array.from(stair.shapes ?? []), surfaceRemovals, { stairId }),
  };
}
