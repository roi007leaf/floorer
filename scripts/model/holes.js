import { isManaged } from "./floor-plan.js";

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

export function mirrorTargets(floorLevel, kind) {
  if (kind === "stair") return [floorLevel, floorLevel.above].filter(hasManagedSurface);
  return [floorLevel.below].filter(hasManagedSurface);
}

export function holeUpdates(floorLevel, shapes, kind) {
  if (!hasManagedSurface(floorLevel)) return [];
  const targets = mirrorTargets(floorLevel, kind).filter((t) => t !== floorLevel);
  const own = holeAppendData(floorLevel.surface, shapes, {});
  const mirrors = targets.map((t) => holeAppendData(t.surface, shapes, { mirrorOf: own.ids }));
  return [own, ...mirrors];
}
