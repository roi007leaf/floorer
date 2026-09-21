import { INTENTS, MODULE_ID, SETTINGS } from "../constants.js";
import { buildFloorPlan, findLevel } from "../model/floor-plan.js";
import { lint } from "../model/issues.js";
import { journal } from "../journal/journal.js";
import { intents } from "../canvas/intents.js";
import { isolation } from "../canvas/isolation.js";
import { autotag } from "../canvas/autotag.js";
import { view } from "../canvas/view.js";
import { getSetting, setSetting } from "../settings.js";
import { SetupDialog } from "./setup-dialog.js";
import { adoptLevel, applyFix, armDraw, issueKey, panelContext, renameLevel, wholeSceneSurface } from "./panel-actions.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

const RERENDER_HOOKS = ["createRegion", "updateRegion", "deleteRegion", "createLevel", "updateLevel", "deleteLevel", "floorer.levelsChanged"];

export class FloorerPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static #instance = null;
  #unsubscribe = [];

  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-panel`,
    classes: ["floorer", "floorer-panel"],
    window: { title: "FLOORER.Title", resizable: true, minimizable: true },
    position: { width: 380, height: "auto" },
    actions: {
      setup: FloorerPanel.#onSetup,
      activate: FloorerPanel.#onActivate,
      drawFootprint: FloorerPanel.#onDraw,
      drawRect: FloorerPanel.#onDraw,
      wholeScene: FloorerPanel.#onWholeScene,
      drawHole: FloorerPanel.#onDraw,
      drawStair: FloorerPanel.#onDraw,
      fix: FloorerPanel.#onFix,
      fixAll: FloorerPanel.#onFixAll,
      undo: FloorerPanel.#onUndo,
      revert: FloorerPanel.#onRevert,
      toggleIsolation: FloorerPanel.#onToggleIsolation,
      adopt: FloorerPanel.#onAdopt,
      cancelIntent: FloorerPanel.#onCancelIntent,
    },
  };

  static PARTS = { body: { template: `modules/${MODULE_ID}/templates/panel.hbs` } };

  static get isOpen() {
    return !!FloorerPanel.#instance?.rendered;
  }

  static open() {
    FloorerPanel.#instance ??= new FloorerPanel();
    return FloorerPanel.#instance.render(true);
  }

  static toggle() {
    if (FloorerPanel.isOpen) return FloorerPanel.#instance.close();
    return FloorerPanel.open();
  }

  get plan() {
    return buildFloorPlan(canvas.scene);
  }

  async _prepareContext() {
    const plan = this.plan;
    return panelContext(plan, {
      activeLevelId: view.activeLevelId,
      issues: lint(plan),
      intent: intents.current,
      journalSize: journal.size,
      isolationEnabled: isolation.enabled,
    });
  }

  _onFirstRender() {
    const saved = getSetting(SETTINGS.PANEL_POSITION);
    if (saved?.left !== undefined) this.setPosition(saved);
    this.#subscribe();
    isolation.setActive(true);
    autotag.setEnabledPredicate(() => FloorerPanel.isOpen);
  }

  _onRender() {
    this.element.querySelectorAll("input[data-rename]").forEach((input) => {
      input.addEventListener("change", (ev) => this.#rename(ev.currentTarget.dataset.rename, ev.currentTarget.value));
    });
  }

  #subscribe() {
    const rerender = () => this.rendered && this.render();
    this.#unsubscribe.push(view.onChange(rerender), intents.onChange(rerender));
    for (const hook of RERENDER_HOOKS) {
      const id = Hooks.on(hook, rerender);
      this.#unsubscribe.push(() => Hooks.off(hook, id));
    }
  }

  async close(options) {
    this.#unsubscribe.forEach((fn) => fn());
    this.#unsubscribe = [];
    isolation.setActive(false);
    intents.clear();
    await setSetting(SETTINGS.PANEL_POSITION, { left: this.position.left, top: this.position.top });
    FloorerPanel.#instance = null;
    return super.close(options);
  }

  #entry(levelId) {
    return findLevel(this.plan, levelId);
  }

  async #rename(levelId, name) {
    const entry = this.#entry(levelId);
    if (entry) await renameLevel(canvas.scene, entry.level, name);
  }

  static #onSetup() {
    new SetupDialog().render(true);
  }

  static async #onActivate(_event, target) {
    await view.setLevel(target.dataset.levelId);
  }

  static #onDraw(_event, target) {
    const { action, levelId } = target.dataset;
    const kind = action === "drawHole" ? INTENTS.HOLE : action === "drawStair" ? INTENTS.STAIR : INTENTS.FOOTPRINT;
    const tool = action === "drawRect" ? "rectangle" : action === "drawFootprint" ? "polygon" : "rectangle";
    const targetLevelId = kind === INTENTS.STAIR ? this.element.querySelector(`select[name="target-${levelId}"]`)?.value : undefined;
    if (kind === INTENTS.STAIR && !targetLevelId) return ui.notifications.warn(game.i18n.localize("FLOORER.Panel.NoTarget"));
    armDraw(kind, levelId, tool, targetLevelId);
  }

  static async #onWholeScene(_event, target) {
    const plan = this.plan;
    const entry = findLevel(plan, target.dataset.levelId);
    if (!entry) return;
    await wholeSceneSurface(canvas.scene, entry, plan.levels.map((e) => e.level));
  }

  static async #onFix(_event, target) {
    const plan = this.plan;
    const issue = lint(plan).find((i) => issueKey(i) === target.dataset.issueKey);
    if (issue) await applyFix(canvas.scene, issue, plan);
  }

  static async #onFixAll() {
    for (let i = 0; i < 20; i++) {
      const plan = this.plan;
      const issue = lint(plan).find((it) => it.fix && !it.fix.intent && !it.fix.prompt);
      if (!issue) break;
      await applyFix(canvas.scene, issue, plan);
    }
  }

  static async #onUndo() {
    if (!(await journal.undo())) ui.notifications.info(game.i18n.localize("FLOORER.Panel.NothingToUndo"));
    this.render();
  }

  static async #onRevert() {
    const ok = await DialogV2.confirm({ window: { title: "FLOORER.Panel.RevertTitle" }, content: `<p>${game.i18n.format("FLOORER.Panel.RevertConfirm", { count: journal.size })}</p>`, rejectClose: false });
    if (ok) await journal.revert();
    this.render();
  }

  static async #onToggleIsolation() {
    await isolation.setEnabled(!isolation.enabled);
    this.render();
  }

  static async #onAdopt(_event, target) {
    const entry = this.#entry(target.dataset.levelId);
    if (entry) await adoptLevel(canvas.scene, entry.level);
  }

  static #onCancelIntent() {
    intents.clear();
  }
}
