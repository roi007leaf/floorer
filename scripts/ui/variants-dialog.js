import { MODULE_ID } from "../constants.js";
import { buildFloorPlan } from "../model/floor-plan.js";
import { sceneStates, variantsOf } from "../model/states.js";
import { ensureArrivalRegion, plainShapes, setStairVariant } from "./panel-actions.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const KINDS = ["off", "level", "scene"];
const PLACEMENTS = ["center", "relative", "random"];

function options(values, selected, label) {
  return values.map((v) => ({ id: v, label: label(v), selected: v === selected }));
}

function levelRows(scene) {
  const levels = Array.from(scene?.levels ?? []);
  return levels
    .sort((a, b) => (b.elevation?.bottom ?? 0) - (a.elevation?.bottom ?? 0))
    .map((l) => ({ id: l.id, name: l.name }));
}

function selectRows(rows, selected) {
  return rows.map((r) => ({ ...r, selected: r.id === selected }));
}

function sceneRows(scene) {
  return Array.from(game.scenes ?? [])
    .filter((s) => s.id !== scene?.id)
    .map((s) => ({ id: s.id, name: s.name }));
}

export class VariantsDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  #stairId;

  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-variants`,
    classes: ["floorer", "floorer-variants"],
    window: { title: "FLOORER.Variants.Title", resizable: false },
    position: { width: 420 },
    actions: { cancel: VariantsDialog.#onCancel },
  };

  static PARTS = { body: { template: `modules/${MODULE_ID}/templates/variants.hbs` } };

  constructor({ stairId, ...rest } = {}) {
    super(rest);
    this.#stairId = stairId;
  }

  get stair() {
    return canvas.scene?.regions.get(this.#stairId) ?? null;
  }

  async _prepareContext() {
    const scene = canvas.scene;
    const stair = this.stair;
    const variants = variantsOf(stair);
    const levels = levelRows(scene);
    const scenes = sceneRows(scene);
    return {
      stairName: stair?.name ?? "",
      rows: sceneStates(scene).map((state) => this.#row(state, variants[state.id], levels, scenes)),
    };
  }

  #row(state, variant, levels, scenes) {
    const kind = KINDS.includes(variant?.kind) ? variant.kind : "off";
    const target = kind === "scene" ? game.scenes?.get(variant.sceneId) : null;
    return {
      stateId: state.id,
      name: state.name,
      kinds: options(KINDS, kind, (k) => `FLOORER.Variants.Kind.${k}`),
      isLevel: kind === "level",
      isScene: kind === "scene",
      levels: selectRows(levels, variant?.levelId),
      scenes: selectRows(scenes, variant?.sceneId),
      sceneLevels: selectRows(levelRows(target), variant?.levelId),
      placements: options(PLACEMENTS, variant?.placement ?? "center", (p) => `FLOORER.Variants.Placement.${p}`),
    };
  }

  _onRender(context, options_) {
    super._onRender(context, options_);
    this.element.querySelectorAll(".variant-row").forEach((row) => {
      row.querySelectorAll("select").forEach((select) => {
        select.addEventListener("change", () => this.#commit(row));
      });
    });
  }

  #read(row) {
    const value = (name) => row.querySelector(`select[name="${name}"]`)?.value ?? null;
    const kind = value("kind");
    if (kind === "level") return { kind, levelId: value("level") };
    if (kind === "scene") return { kind, sceneId: value("scene"), levelId: value("sceneLevel"), placement: value("placement") };
    return { kind: "off" };
  }

  async #resolve(draft) {
    if (draft.kind !== "scene") return draft;
    const target = game.scenes?.get(draft.sceneId);
    const levelId = target?.levels.get(draft.levelId) ? draft.levelId : levelRows(target)[0]?.id;
    if (!target || !levelId) return null;
    const region = await ensureArrivalRegion(target, levelId, plainShapes(this.stair));
    return region ? { ...draft, levelId, regionId: region.id } : null;
  }

  async #commit(row) {
    const scene = canvas.scene;
    const variant = await this.#resolve(this.#read(row));
    if (!variant) return this.render();
    await setStairVariant(scene, buildFloorPlan(scene), this.#stairId, row.dataset.stateId, variant);
    await this.render();
  }

  static #onCancel() {
    this.close();
  }
}
