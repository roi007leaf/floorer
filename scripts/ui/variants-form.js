export const VARIANT_KINDS = ["off", "level", "scene"];
export const VARIANT_PLACEMENTS = ["center", "relative", "random"];

function present(value) {
  return value !== null && value !== undefined && value !== "";
}

function pick(...values) {
  return values.find(present) ?? null;
}

export function draftFromRow(values = {}) {
  const kind = pick(values.kind);
  if (kind === "level") return { kind, levelId: pick(values.level) };
  if (kind !== "scene") return { kind: "off" };
  return {
    kind,
    sceneId: pick(values.scene),
    levelId: pick(values.sceneLevel),
    placement: pick(values.placement, "center"),
  };
}

export function isIncompleteDraft(draft) {
  return draft?.kind === "scene" && !draft.sceneId;
}
