import { findLevel, isManaged } from "./floor-plan.js";

function plainShape(shape) {
  const obj = typeof shape.toObject === "function" ? shape.toObject() : shape;
  return foundry.utils.deepClone(obj);
}

export function toHoleShapes(shapes) {
  return shapes.map((s) => ({ ...plainShape(s), hole: true }));
}

function existingHoles(surface) {
  return foundry.utils.deepClone(surface.flags?.floorer?.holes ?? []);
}

export function holeAppendData(surface, shapes, { mirrorOf, extra } = {}) {
  const added = toHoleShapes(shapes);
  const ids = added.map(() => foundry.utils.randomID());
  const holes = ids.map((id, i) => ({ id, ...(mirrorOf ? { mirrorOf: mirrorOf[i] } : {}), ...extra }));
  return {
    _id: surface.id,
    shapes: [...surface.shapes.map(plainShape), ...added],
    "flags.floorer.holes": [...existingHoles(surface), ...holes],
    ids,
  };
}

function hasManagedSurface(entry) {
  return !!entry?.surface && isManaged(entry.surface);
}

export function mirrorTargets(floorLevel) {
  return [floorLevel.below].filter(hasManagedSurface);
}

export function holeUpdates(floorLevel, shapes, kind) {
  if (!hasManagedSurface(floorLevel)) return [];
  const targets = mirrorTargets(floorLevel, kind).filter((t) => t !== floorLevel);
  const own = holeAppendData(floorLevel.surface, shapes, {});
  const mirrors = targets.map((t) => holeAppendData(t.surface, shapes, { mirrorOf: own.ids }));
  return [own, ...mirrors];
}

function keepMask(holes, predicate) {
  return holes.map((h) => !predicate(h));
}

function filterShapes(shapes, keep) {
  let k = 0;
  return shapes.map(plainShape).filter((s) => (s.hole ? keep[k++] !== false : true));
}

export function removeHolesData(surface, predicate) {
  const holes = existingHoles(surface);
  const keep = keepMask(holes, predicate);
  const removed = holes.filter((_, i) => !keep[i]).map((h) => h.id);
  if (!removed.length) return null;
  return {
    _id: surface.id,
    shapes: filterShapes(Array.from(surface.shapes ?? []), keep),
    "flags.floorer.holes": holes.filter((_, i) => keep[i]),
    removed,
  };
}

function managedSurfaces(plan) {
  return plan.levels.map((e) => e.surface).filter((s) => s && isManaged(s));
}

function holesOf(surface) {
  return surface.flags?.floorer?.holes ?? [];
}

function removeAcross(plan, predicate) {
  return managedSurfaces(plan)
    .map((s) => removeHolesData(s, predicate))
    .filter(Boolean);
}

export function stairRemovalUpdates(plan, stairId) {
  const ids = new Set(managedSurfaces(plan).flatMap(holesOf).filter((h) => h.stairId === stairId).map((h) => h.id));
  return removeAcross(plan, (h) => h.stairId === stairId || ids.has(h.mirrorOf));
}

export function holeRemovalUpdates(plan, holeId) {
  return removeAcross(plan, (h) => h.id === holeId || h.mirrorOf === holeId);
}

function surfaceHoleShapes(surface) {
  return Array.from(surface.shapes ?? [])
    .map(plainShape)
    .filter((s) => s.hole);
}

export function tracedHoleMirror(plan, levelId) {
  const entry = findLevel(plan, levelId);
  const holes = entry?.surface?.flags?.floorer?.holes ?? [];
  if (!holes.length || !hasManagedSurface(entry.below)) return null;
  return holeAppendData(entry.below.surface, surfaceHoleShapes(entry.surface), { mirrorOf: holes.map((h) => h.id) });
}
