import { bandOf } from "./floor-plan.js";

function bandContains(band, elevation) {
  if (band.bottom !== null && elevation < band.bottom) return false;
  if (band.top !== null && elevation >= band.top) return false;
  return true;
}

function bandDistance(band, elevation) {
  if (bandContains(band, elevation)) return 0;
  if (band.bottom !== null && elevation < band.bottom) return band.bottom - elevation;
  if (band.top !== null && elevation >= band.top) return elevation - band.top;
  return Infinity;
}

function nearestManaged(candidates, elevation) {
  return candidates.reduce((best, entry) => {
    const distance = bandDistance(bandOf(entry.level), elevation);
    return !best || distance < best.distance ? { entry, distance } : best;
  }, null)?.entry ?? null;
}

function tokensOf(plan, levelId) {
  return Array.from(plan.scene?.tokens ?? []).filter((t) => t.level === levelId);
}

export function levelRemovalPlan(plan, levelId) {
  if (!plan || plan.levels.length <= 1) return null;
  const candidates = plan.levels.filter((e) => e.level.id !== levelId && e.managed);
  if (!candidates.length) return null;
  const tokens = tokensOf(plan, levelId).map((t) => {
    const elevation = t.elevation ?? 0;
    const target = nearestManaged(candidates, elevation);
    return { _id: t.id, level: target.level.id, elevation: t.elevation };
  });
  const fallback = nearestManaged(candidates, 0);
  return { tokens, fallbackId: fallback.level.id };
}
