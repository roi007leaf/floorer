import { INTENTS, ROLES, SETTINGS } from "../constants.js";
import { buildFloorPlan, findLevel } from "../model/floor-plan.js";
import { holeUpdates } from "../model/holes.js";
import { movementActionKeys, stairCreateData, surfaceCreateData } from "../model/regions.js";
import { stairOpeningUpdates } from "../model/stair-retarget.js";
import { journal } from "../journal/journal.js";
import { getSetting } from "../settings.js";

function notify(kind, key, data) {
  ui.notifications?.[kind](game.i18n.format(key, data));
}

function levelName(levelId) {
  return canvas.scene?.levels?.get(levelId)?.name ?? levelId;
}

function beforeOf(scene, updates) {
  return updates.map((u) => {
    const doc = scene.regions.get(u._id);
    return { _id: u._id, shapes: Array.from(doc.shapes).map((s) => (typeof s.toObject === "function" ? s.toObject() : s)), "flags.floorer.holes": foundry.utils.deepClone(doc.flags?.floorer?.holes ?? []) };
  });
}

async function applyHoleUpdates(scene, updates) {
  if (!updates.length) return;
  const before = beforeOf(scene, updates);
  const data = updates.map(({ ids, ...rest }) => rest);
  await journal.run({ op: "update", collection: "regions", scene, before }, () => scene.updateEmbeddedDocuments("Region", data));
}

function releaseRegions() {
  canvas.regions?.releaseAll?.();
  canvas.regions?.placeables?.forEach((p) => p.sheet?.rendered && p.sheet.close());
}

function armedToolActive(intent) {
  return ui.controls?.control?.name === "regions" && ui.controls?.tool?.name === intent.tool;
}

class Intents {
  #current = null;
  #arming = false;
  #listeners = new Set();

  get current() {
    return this.#current;
  }

  onChange(fn) {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  #emit() {
    for (const fn of this.#listeners) fn(this.#current);
  }

  arm(intent) {
    this.#current = { ...intent };
    releaseRegions();
    this.#arming = true;
    try {
      canvas.regions?.activate({ tool: intent.tool });
    } finally {
      this.#arming = false;
    }
    notify("info", `FLOORER.Intent.Armed.${intent.kind}`, { level: levelName(intent.levelId) });
    this.#emit();
  }

  onSceneControls() {
    if (this.#arming || !this.#current) return;
    if (!armedToolActive(this.#current)) this.clear();
  }

  clear() {
    if (!this.#current) return;
    this.#current = null;
    this.#emit();
  }

  #take() {
    const intent = this.#current;
    this.clear();
    return intent;
  }

  onPreCreateRegion(document, data, options, userId) {
    if (!this.#current || userId !== game.user.id || !canvas.scene) return undefined;
    const intent = this.#take();
    const plan = buildFloorPlan(canvas.scene);
    const entry = findLevel(plan, intent.levelId);
    if (!entry) return this.#abort("FLOORER.Intent.LevelMissing");
    if (intent.kind === INTENTS.HOLE) return this.#adoptHole(entry, data.shapes ?? []);
    if (intent.kind === INTENTS.STAIR) return this.#adoptStair(document, data, plan, entry, intent);
    return this.#adoptFootprint(document, data, plan, entry);
  }

  #abort(key) {
    notify("warn", key, {});
    return false;
  }

  #adoptFootprint(document, data, plan, entry) {
    const allLevels = plan.levels.map((e) => e.level);
    document.updateSource(surfaceCreateData(entry.level, allLevels, data.shapes ?? []));
    return true;
  }

  #adoptStair(document, data, plan, entry, intent) {
    const target = findLevel(plan, intent.targetLevelId);
    if (!target) return this.#abort("FLOORER.Intent.TargetMissing");
    const index = canvas.scene.regions.filter((r) => r.flags.floorer?.role === ROLES.STAIR).length;
    document.updateSource(stairCreateData(entry.level, target.level, data.shapes ?? [], movementActionKeys(), index, plan));
    return true;
  }

  #adoptHole(entry, shapes) {
    const updates = holeUpdates(entry, shapes, INTENTS.HOLE);
    if (!updates.length) return this.#abort("FLOORER.Intent.SurfaceMissing");
    if (!getSetting(SETTINGS.MIRROR_HOLES)) updates.splice(1);
    applyHoleUpdates(canvas.scene, updates).catch(() => notify("error", "FLOORER.Intent.WriteFailed", {}));
    return false;
  }

  async onCreateRegion(document, options, userId) {
    const flag = document.flags?.floorer;
    if (userId !== game.user.id || flag?.role !== ROLES.STAIR || !canvas.scene) return;
    if (!getSetting(SETTINGS.MIRROR_HOLES)) return;
    const plan = buildFloorPlan(canvas.scene);
    await applyHoleUpdates(canvas.scene, stairOpeningUpdates(plan, document));
  }
}

export const intents = new Intents();
