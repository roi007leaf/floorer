import { isManaged, surfaceLevels } from "./floor-plan.js";
import { sameSet } from "./issues.js";

function visibilityOf(level) {
  return Array.from(level?.visibility?.levels ?? []);
}

export function isSealed(level) {
  const vis = visibilityOf(level);
  return vis.length === 1 && vis[0] === level.id;
}

function without(list, id) {
  return list.filter((x) => x !== id);
}

function withId(list, id) {
  return list.includes(id) ? list : [...list, id];
}

function sealedVisibility(levels, levelId) {
  return levels.map((l) => (l.id === levelId ? [levelId] : without(visibilityOf(l), levelId)));
}

function unsealedVisibility(levels, levelId) {
  const open = levels.filter((l) => l.id !== levelId && !isSealed(l)).map((l) => l.id);
  return levels.map((l) => {
    if (l.id === levelId) return [levelId, ...open];
    return open.includes(l.id) ? withId(visibilityOf(l), levelId) : visibilityOf(l);
  });
}

function levelChanges(levels, next) {
  return levels.flatMap((l, i) => {
    const current = visibilityOf(l);
    if (sameSet(current, next[i])) return [];
    return [{ update: { _id: l.id, "visibility.levels": next[i] }, before: { _id: l.id, "visibility.levels": current } }];
  });
}

function regionChanges(plan, shells) {
  return plan.levels.flatMap((entry) => {
    const surface = entry.surface;
    if (!surface || !isManaged(surface)) return [];
    const shell = shells.find((s) => s.id === entry.level.id);
    const want = surfaceLevels(shell, shells);
    const current = Array.from(surface.levels ?? []);
    if (sameSet(current, want)) return [];
    return [{ update: { _id: surface.id, levels: want }, before: { _id: surface.id, levels: current } }];
  });
}

export function sealUpdates(plan, levelId, sealed) {
  const levels = plan.levels.map((e) => e.level);
  if (!levels.some((l) => l.id === levelId)) return { levels: [], regions: [], before: { levels: [], regions: [] } };
  const next = sealed ? sealedVisibility(levels, levelId) : unsealedVisibility(levels, levelId);
  const shells = levels.map((l, i) => ({ id: l.id, visibility: { levels: next[i] } }));
  const lv = levelChanges(levels, next);
  const rg = regionChanges(plan, shells);
  return {
    levels: lv.map((c) => c.update),
    regions: rg.map((c) => c.update),
    before: { levels: lv.map((c) => c.before), regions: rg.map((c) => c.before) },
  };
}
