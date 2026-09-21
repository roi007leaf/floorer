import { FLAG_VERSION, ROLES } from "../constants.js";
import { bandOf, findLevel, isManaged, orderPair, shaftLevels, shaftOf, surfaceLevels } from "./floor-plan.js";
import { shapeCenter, shapesContain } from "./shapes.js";

export function surfaceBehavior(level) {
  const placement = bandOf(level).top === null ? "bottom" : "both";
  return {
    type: "defineSurface",
    system: { placement, light: true, move: true, sight: true, sound: true, occlusion: true, exposure: false, culling: false },
  };
}

export function movementActionKeys() {
  return Object.keys(CONFIG.Token.movement.actions).filter((k) => k !== "displace");
}

export function stairBehavior(actions) {
  return { type: "changeLevel", system: { movementActions: actions.filter((a) => a !== "displace") } };
}

function band(level) {
  return { ...bandOf(level), topInclusive: true };
}

function holeEntriesFor(shapes) {
  return shapes.filter((s) => s.hole).map(() => ({ id: foundry.utils.randomID(), traced: true }));
}

export function surfaceCreateData(level, allLevels, shapes) {
  return {
    name: `Surface ${level.name}`,
    shapes,
    elevation: band(level),
    levels: surfaceLevels(level, allLevels),
    behaviors: [surfaceBehavior(level)],
    flags: { floorer: { role: ROLES.SURFACE, levelId: level.id, holes: holeEntriesFor(shapes), managed: true, v: FLAG_VERSION } },
  };
}

export const STAIR_PALETTE = ["#e6194b", "#3cb44b", "#ffe119", "#4363d8", "#f58231", "#911eb4", "#42d4f4", "#f032e6", "#bfef45", "#fabebe", "#469990", "#dcbeff"];

export function stairColor(index) {
  return STAIR_PALETTE[index % STAIR_PALETTE.length];
}

export function stairStops(plan, lower, upper, shapes) {
  const point = shapeCenter(Array.from(shapes ?? [])[0]);
  const allLevels = plan.levels.map((e) => e.level);
  const ends = new Set([lower.id, upper.id]);
  return shaftLevels(lower, upper, allLevels)
    .filter((l) => !ends.has(l.id))
    .filter((l) => {
      const surface = findLevel(plan, l.id)?.surface;
      return !!surface && isManaged(surface) && shapesContain(surface.shapes, point);
    })
    .map((l) => l.id);
}

export function stairLevelTags(lower, upper, stops) {
  return [lower.id, ...stops, upper.id];
}

export function stairCreateData(levelA, levelB, shapes, actions, index = 0, plan = { levels: [] }) {
  const { lower, upper } = orderPair(levelA, levelB);
  const allLevels = plan.levels.map((e) => e.level);
  const shaft = shaftOf(lower, upper, allLevels);
  const stops = stairStops(plan, lower, upper, shapes);
  return {
    name: `Stair ${lower.name} ↔ ${upper.name}`,
    color: stairColor(index),
    shapes,
    elevation: { ...shaft.band, topInclusive: true },
    levels: stairLevelTags(lower, upper, stops),
    behaviors: [stairBehavior(actions)],
    flags: { floorer: { role: ROLES.STAIR, levelId: lower.id, targetLevelId: upper.id, stops, index, managed: true, v: FLAG_VERSION } },
  };
}

export function managedStairs(regions) {
  return Array.from(regions).filter((r) => r.flags?.floorer?.role === ROLES.STAIR && r.flags.floorer.managed);
}

export function stairIndexUpdates(regions) {
  const stairs = managedStairs(regions);
  if (!stairs.some((r) => r.flags.floorer.index === undefined)) return [];
  return stairs.map((r, index) => ({ _id: r.id, color: stairColor(index), "flags.floorer.index": index }));
}

export function wholeSceneShape(rect) {
  return { type: "rectangle", x: rect.x, y: rect.y, width: rect.width, height: rect.height, rotation: 0, hole: false };
}
