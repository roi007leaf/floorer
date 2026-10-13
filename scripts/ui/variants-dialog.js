import { MODULE_ID } from "../constants.js";
import { buildFloorPlan } from "../model/floor-plan.js";
import { sceneStates, variantsOf } from "../model/states.js";
import { ensureArrivalRegion, plainShapes, setStairVariant } from "./panel-actions.js";
import { draftFromRow, isIncompleteDraft, VARIANT_KINDS, VARIANT_PLACEMENTS } from "./variants-form.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

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
  const all = Array.from(game.scenes ?? []);
  const others = all.filter((s) => s.id !== scene?.id);
  return (others.length ? others : all).map((s) => ({ id: s.id, name: s.name }));
}

export class VariantsDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  #stairId;
  #pendingKind = {};

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
    const saved = VARIANT_KINDS.includes(variant?.kind) ? variant.kind : "off";
    const kind = this.#pendingKind[state.id] ?? saved;
    const savedScene = saved === "scene" ? variant : null;
    const target = savedScene ? game.scenes?.get(savedScene.sceneId) : null;
    return {
      stateId: state.id,
      name: state.name,
      kinds: options(VARIANT_KINDS, kind, (k) => `FLOORER.Variants.Kind.${k}`),
      isLevel: kind === "level",
      isScene: kind === "scene",
      levels: selectRows(levels, variant?.levelId),
      sceneChosen: Boolean(savedScene?.sceneId),
      scenes: selectRows(scenes, savedScene?.sceneId),
      sceneLevels: selectRows(levelRows(target), savedScene?.levelId),
      placements: options(VARIANT_PLACEMENTS, variant?.placement ?? "center", (p) => `FLOORER.Variants.Placement.${p}`),
    };
  }

  _onRender(context, options_) {
    super._onRender(context, options_);
    this.element.querySelectorAll(".variant-row").forEach((row) => {
      row.querySelectorAll("select").forEach((select) => {
        select.addEventListener("change", () => this.#onChange(row, select));
      });
    });
  }

  #read(row) {
    const value = (name) => row.querySelector(`select[name="${name}"]`)?.value ?? null;
    const values = { kind: value("kind"), level: value("level"), scene: value("scene"), sceneLevel: value("sceneLevel"), placement: value("placement") };
    return draftFromRow(values);
  }

  async #resolve(draft) {
    if (draft.kind !== "scene") return draft;
    const target = game.scenes?.get(draft.sceneId);
    const levelId = target?.levels.get(draft.levelId) ? draft.levelId : levelRows(target)[0]?.id;
    if (!target || !levelId) return null;
    const region = await ensureArrivalRegion(target, levelId, plainShapes(this.stair));
    return region ? { ...draft, levelId, regionId: region.id } : null;
  }

  #onChange(row, select) {
    if (select.name === "kind") {
      if (select.value === "scene") this.#pendingKind[row.dataset.stateId] = "scene";
      else delete this.#pendingKind[row.dataset.stateId];
    }
    return this.#commit(row);
  }

  async #commit(row) {
    const scene = canvas.scene;
    const draft = this.#read(row);
    if (isIncompleteDraft(draft)) return this.render();
    const variant = await this.#resolve(draft);
    if (!variant) {
      ui.notifications.warn(game.i18n.localize("FLOORER.Variants.NoDestination"));
      return this.render();
    }
    await setStairVariant(scene, buildFloorPlan(scene), this.#stairId, row.dataset.stateId, variant);
    delete this.#pendingKind[row.dataset.stateId];
    await this.render();
  }

  static #onCancel() {
    this.close();
  }
}
