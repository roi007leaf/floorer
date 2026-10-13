import { buildFloorPlan } from "./model/floor-plan.js";
import { activeStateId, sceneStates, stateById } from "./model/states.js";
import { applySceneState } from "./ui/panel-actions.js";

function resolveScene(scene) {
  return scene ?? canvas.scene ?? null;
}

function requireGM() {
  if (game.user?.isGM) return true;
  ui.notifications.warn(game.i18n.localize("FLOORER.Api.GMOnly"));
  return false;
}

export function getStates(scene) {
  return sceneStates(resolveScene(scene));
}

export function activeState(scene) {
  const target = resolveScene(scene);
  return target ? stateById(target, activeStateId(target)) : null;
}

async function apply(target, state) {
  await applySceneState(target, buildFloorPlan(target), state?.id ?? null);
  return state;
}

export async function setStateById(scene, id) {
  const target = resolveScene(scene);
  if (!target || !requireGM()) return null;
  if (id === null) return apply(target, null);
  const state = sceneStates(target).find((s) => s.id === id) ?? null;
  return state ? apply(target, state) : null;
}

export async function setState(scene, idOrName) {
  const target = resolveScene(scene);
  if (!target || !requireGM()) return null;
  if (idOrName === null) return apply(target, null);
  const state = stateById(target, idOrName);
  return state ? apply(target, state) : null;
}

export const api = { getStates, activeState, setState, setStateById };
