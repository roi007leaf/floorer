import { isManaged } from "./floor-plan.js";

export function sceneStates(scene) {
  const states = scene?.flags?.floorer?.states;
  return Array.isArray(states) ? states : [];
}

export function activeStateId(scene) {
  return scene?.flags?.floorer?.activeState ?? null;
}

export function stateById(scene, idOrName) {
  const states = sceneStates(scene);
  return states.find((s) => s.id === idOrName) ?? states.find((s) => s.name === idOrName) ?? null;
}

function statesData(states) {
  return { "flags.floorer.states": states };
}

export function addStateData(scene, name) {
  return statesData([...sceneStates(scene), { id: foundry.utils.randomID(), name }]);
}

export function renameStateData(scene, id, name) {
  return statesData(sceneStates(scene).map((s) => (s.id === id ? { ...s, name } : s)));
}

export function removeStateData(scene, id) {
  const states = sceneStates(scene).filter((s) => s.id !== id);
  const data = statesData(states);
  if (activeStateId(scene) !== id) return data;
  return { ...data, "flags.floorer.activeState": states[0]?.id ?? null };
}

export function variantsOf(stair) {
  return stair?.flags?.floorer?.variants ?? {};
}

function variantEntries(stair) {
  return Object.entries(variantsOf(stair));
}

export function variantBehaviorData(variant, stateId, { actions = [] } = {}) {
  const flags = { floorer: { stateId } };
  if (variant?.kind === "level") return { type: "changeLevel", system: { movementActions: actions.filter((a) => a !== "displace") }, flags };
  if (variant?.kind === "scene") {
    const destinations = [`Scene.${variant.sceneId}.Region.${variant.regionId}`];
    return { type: "teleportToken", system: { destinations, placement: variant.placement ?? "center", choice: false }, flags };
  }
  return null;
}

function behaviorList(stair) {
  return Array.from(stair?.behaviors ?? []);
}

function behaviorId(behavior) {
  return behavior.id ?? behavior._id;
}

function behaviorStateId(behavior) {
  return behavior.flags?.floorer?.stateId ?? null;
}

export function hasVariants(stair) {
  return variantEntries(stair).length > 0;
}

export function variantStairs(plan) {
  return plan.levels.flatMap((e) => e.stairs).filter((stair) => isManaged(stair) && hasVariants(stair));
}

export function behaviorStateUpdates(stair, activeId) {
  const legacyEnabled = !hasVariants(stair);
  return behaviorList(stair).flatMap((behavior) => {
    const stateId = behaviorStateId(behavior);
    const disabled = !(stateId === null ? legacyEnabled : stateId === activeId);
    return behavior.disabled === disabled ? [] : [{ _id: behaviorId(behavior), disabled }];
  });
}

export function missingVariantBehaviors(stair, options = {}) {
  const covered = new Set(behaviorList(stair).map(behaviorStateId).filter(Boolean));
  return variantEntries(stair)
    .filter(([stateId]) => !covered.has(stateId))
    .map(([stateId, variant]) => variantBehaviorData(variant, stateId, options))
    .filter(Boolean);
}
