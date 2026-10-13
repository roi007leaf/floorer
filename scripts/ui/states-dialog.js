import { MODULE_ID } from "../constants.js";
import { buildFloorPlan } from "../model/floor-plan.js";
import { activeStateId, sceneStates } from "../model/states.js";
import { addState, applySceneState, removeState, renameState } from "./panel-actions.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

export class StatesDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-states`,
    classes: ["floorer", "floorer-states"],
    window: { title: "FLOORER.States.Title", resizable: false },
    position: { width: 420 },
    actions: {
      addState: StatesDialog.#onAdd,
      removeState: StatesDialog.#onRemove,
      activateState: StatesDialog.#onActivate,
      cancel: StatesDialog.#onCancel,
    },
  };

  static PARTS = { body: { template: `modules/${MODULE_ID}/templates/states.hbs` } };

  async _prepareContext() {
    const scene = canvas.scene;
    const active = activeStateId(scene);
    return { rows: sceneStates(scene).map((s) => ({ id: s.id, name: s.name, active: s.id === active })) };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.element.querySelectorAll("input.state-name").forEach((input) => {
      input.addEventListener("change", () => this.#rename(input));
    });
    const add = this.element.querySelector("input[name='new-state']");
    add?.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      this.#add();
    });
  }

  async #refresh() {
    await this.render();
    Hooks.callAll("floorer.statesChanged");
  }

  async #rename(input) {
    await renameState(canvas.scene, input.dataset.stateId, input.value);
    await this.#refresh();
  }

  async #add() {
    const input = this.element.querySelector("input[name='new-state']");
    const name = input?.value ?? "";
    if (!name.trim()) return;
    input.value = "";
    await addState(canvas.scene, name);
    await this.#refresh();
  }

  static #onAdd() {
    return this.#add();
  }

  static async #onRemove(_event, target) {
    const ok = await DialogV2.confirm({
      window: { title: "FLOORER.States.DeleteTitle" },
      content: `<p>${game.i18n.localize("FLOORER.States.ConfirmDelete")}</p>`,
      rejectClose: false,
    });
    if (!ok) return;
    await removeState(canvas.scene, target.dataset.stateId);
    await this.#refresh();
  }

  static async #onActivate(_event, target) {
    const scene = canvas.scene;
    await applySceneState(scene, buildFloorPlan(scene), target.dataset.stateId);
    await this.#refresh();
  }

  static #onCancel() {
    this.close();
  }
}
