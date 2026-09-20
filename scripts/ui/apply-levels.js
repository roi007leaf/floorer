import { SETTINGS } from "../constants.js";
import { generateLevelData, visibilityFor } from "../model/levels.js";
import { isManaged } from "../model/floor-plan.js";
import { journal } from "../journal/journal.js";
import { getSetting } from "../settings.js";

function sameBand(a, b) {
  return a.bottom === b.bottom && (a.top ?? null) === (b.top ?? null);
}

export function planLevelChanges(scene, opts) {
  const existing = Array.from(scene.levels ?? []);
  const generated = generateLevelData(opts);
  const reuse = [];
  const create = [];
  for (const data of generated) {
    const match = existing.find((l) => sameBand(l.elevation, data.elevation));
    if (match) reuse.push({ existing: match, data });
    else create.push(data);
  }
  const reused = new Set(reuse.map((r) => r.existing));
  const conflicts = existing.filter((l) => isManaged(l) && !reused.has(l));
  return { create, reuse, conflicts };
}

function reuseUpdate({ existing, data }) {
  const upd = { _id: existing.id, flags: data.flags, sort: data.sort };
  if (data.background?.src) upd.background = { src: data.background.src };
  return upd;
}

function levelSource(level) {
  return typeof level.toObject === "function" ? level.toObject() : foundry.utils.deepClone(level);
}

async function deleteConflicts(scene, conflicts) {
  if (!conflicts.length) return;
  const before = conflicts.map(levelSource);
  await journal.run({ op: "delete", collection: "levels", scene, before }, () => scene.deleteEmbeddedDocuments("Level", conflicts.map((c) => c.id)));
}

async function createLevels(scene, create) {
  if (!create.length) return;
  await journal.run({ op: "create", collection: "levels", scene }, () => scene.createEmbeddedDocuments("Level", create));
}

async function updateReused(scene, reuse) {
  if (!reuse.length) return;
  const before = reuse.map((r) => ({ _id: r.existing.id, flags: foundry.utils.deepClone(r.existing.flags ?? {}), sort: r.existing.sort, background: foundry.utils.deepClone(r.existing.background ?? {}) }));
  await journal.run({ op: "update", collection: "levels", scene, before }, () => scene.updateEmbeddedDocuments("Level", reuse.map(reuseUpdate)));
}

async function applyVisibility(scene) {
  const managed = Array.from(scene.levels).filter(isManaged);
  const before = managed.map((l) => ({ _id: l.id, "visibility.levels": Array.from(l.visibility?.levels ?? []) }));
  const sealBasements = getSetting(SETTINGS.SEAL_BASEMENTS);
  const updates = visibilityFor(managed.map((l) => ({ _id: l.id, flags: l.flags })), { sealBasements });
  await journal.run({ op: "update", collection: "levels", scene, before }, () => scene.updateEmbeddedDocuments("Level", updates));
}

export async function applyLevels(scene, opts, { onConflict }) {
  const { create, reuse, conflicts } = planLevelChanges(scene, opts);
  let choice = "keep";
  if (conflicts.length) choice = await onConflict(conflicts);
  if (choice === "cancel") return false;
  if (choice === "replace") await deleteConflicts(scene, conflicts);
  await createLevels(scene, create);
  await updateReused(scene, reuse);
  await applyVisibility(scene);
  return true;
}
