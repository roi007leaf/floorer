import { FLAG_VERSION, ROLES } from "../constants.js";
import { orderPair, surfaceLevels } from "./floor-plan.js";

export function surfaceBehavior(level) {
  const placement = level.elevation.top === null ? "bottom" : "both";
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
  return { bottom: level.elevation.bottom, top: level.elevation.top };
}

export function surfaceCreateData(level, allLevels, shapes) {
  return {
    name: `Surface ${level.name}`,
    shapes,
    elevation: band(level),
    topInclusive: true,
    levels: surfaceLevels(level, allLevels),
    behaviors: [surfaceBehavior(level)],
    flags: { floorer: { role: ROLES.SURFACE, levelId: level.id, holes: [], managed: true, v: FLAG_VERSION } },
  };
}

export function stairCreateData(levelA, levelB, shapes, actions) {
  const { lower, upper } = orderPair(levelA, levelB);
  return {
    name: `Stair ${lower.name} ↔ ${upper.name}`,
    shapes,
    elevation: band(lower),
    topInclusive: true,
    levels: [lower.id, upper.id],
    behaviors: [stairBehavior(actions)],
    flags: { floorer: { role: ROLES.STAIR, levelId: lower.id, targetLevelId: upper.id, managed: true, v: FLAG_VERSION } },
  };
}

export function wholeSceneShape(rect) {
  return { type: "rectangle", x: rect.x, y: rect.y, width: rect.width, height: rect.height, rotation: 0, hole: false };
}
