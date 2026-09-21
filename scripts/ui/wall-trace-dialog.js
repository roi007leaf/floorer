import { MODULE_ID } from "../constants.js";
import { loadImageData } from "../canvas/image-alpha.js";
import { imagePlacement } from "../model/trace.js";
import { segmentsBounds, traceWallSegments, viewFit } from "../model/wall-trace.js";
import { createInteriorWalls, outlineWallSegments } from "./panel-actions.js";
import { WallPreview } from "./wall-preview.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const IMAGE_MAX = 1600;
const DEBOUNCE_MS = 150;
const PAN_MS = 400;
const DEFAULTS = Object.freeze({ edgeStrength: 0.3, minSquares: 1 });
const DECIMALS = Object.freeze({ edgeStrength: 2, minSquares: 1 });

export class WallTraceDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  #scene;
  #entry;
  #params = { ...DEFAULTS };
  #image = null;
  #segments = [];
  #stats = null;
  #preview = new WallPreview();
  #timer = null;
  #hooks = [];
  #panned = false;

  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-wall-trace`,
    classes: ["floorer", "floorer-wall-trace"],
    window: { title: "FLOORER.WallTrace.Title", resizable: false },
    position: { width: 420 },
    actions: { apply: WallTraceDialog.#onApply, cancel: WallTraceDialog.#onCancel },
  };

  static PARTS = { body: { template: `modules/${MODULE_ID}/templates/wall-trace.hbs` } };

  constructor({ scene, entry, ...options } = {}) {
    super(options);
    this.#scene = scene;
    this.#entry = entry;
  }

  async _prepareContext() {
    return { id: this.id, ...this.#params, count: this.#segments.length, loading: !this.#image };
  }

  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    this.#load();
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.element.querySelectorAll("input[type=range]").forEach((input) => input.addEventListener("input", () => this.#onSlide()));
  }

  async #load() {
    const level = this.#entry.level;
    this.#image = await loadImageData(level.background?.src, IMAGE_MAX);
    if (!this.#image) {
      ui.notifications.warn(game.i18n.localize("FLOORER.WallTrace.NoImage"));
      return this.close();
    }
    this.#preview.show();
    this.#hooks = [["canvasTearDown", Hooks.on("canvasTearDown", () => this.close())]];
    this.#recompute();
  }

  #readParams() {
    for (const [name, digits] of Object.entries(DECIMALS)) {
      const value = Number(this.element.querySelector(`input[name=${name}]`).value);
      this.#params[name] = value;
      this.element.querySelector(`output[name=${name}]`).textContent = value.toFixed(digits);
    }
  }

  #onSlide() {
    this.#readParams();
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.#recompute(), DEBOUNCE_MS);
  }

  #recompute() {
    if (!this.#image || !this.rendered) return;
    this.#showBusy();
    const params = { ...this.#params };
    setTimeout(() => this.#compute(params), 0);
  }

  #compute(params) {
    if (!this.#image || !this.rendered) return;
    const level = this.#entry.level;
    const input = { image: this.#image, level, sceneRect: this.#scene.dimensions.sceneRect, gridSize: canvas.grid.size, outline: outlineWallSegments(this.#scene, level.id) };
    const { segments, stats } = traceWallSegments(input, params);
    this.#segments = segments;
    this.#stats = stats;
    this.#preview.draw(segments);
    this.#showCount();
    this.#panToPreview();
  }

  #placementRect() {
    const { imageWidth, imageHeight } = this.#image;
    const { x, y, scaleX, scaleY } = imagePlacement(this.#entry.level, this.#scene.dimensions.sceneRect, imageWidth, imageHeight);
    return { x, y, width: scaleX * imageWidth, height: scaleY * imageHeight };
  }

  #panToPreview() {
    if (this.#panned) return;
    this.#panned = true;
    const rect = segmentsBounds(this.#segments) ?? this.#placementRect();
    canvas.animatePan({ ...viewFit(rect, canvas.app.renderer.screen), duration: PAN_MS });
  }

  #countPill() {
    return this.element.querySelector(".count");
  }

  #showBusy() {
    const node = this.#countPill();
    if (!node) return;
    node.classList.add("busy");
    node.textContent = game.i18n.localize("FLOORER.WallTrace.Computing");
  }

  #countText() {
    if (this.#stats && this.#stats.edgePixels === 0) return game.i18n.localize("FLOORER.WallTrace.NoEdges");
    return game.i18n.format("FLOORER.WallTrace.Count", { count: this.#segments.length });
  }

  #showCount() {
    const node = this.#countPill();
    if (node) {
      node.classList.remove("busy");
      node.textContent = this.#countText();
    }
    const apply = this.element.querySelector("button[data-action=apply]");
    if (apply) apply.disabled = !this.#segments.length;
  }

  #clearPreview() {
    clearTimeout(this.#timer);
    for (const [hook, id] of this.#hooks) Hooks.off(hook, id);
    this.#hooks = [];
    this.#preview.hide();
  }

  async close(options) {
    this.#clearPreview();
    return super.close(options);
  }

  static async #onApply() {
    const count = await createInteriorWalls(this.#scene, this.#entry.level.id, this.#segments);
    ui.notifications.info(game.i18n.format("FLOORER.WallTrace.Created", { count }));
    await this.close();
  }

  static #onCancel() {
    return this.close();
  }
}
