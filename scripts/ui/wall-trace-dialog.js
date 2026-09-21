import { MODULE_ID } from "../constants.js";
import { loadImageData } from "../canvas/image-alpha.js";
import { traceWallSegments } from "../model/wall-trace.js";
import { createInteriorWalls, outlineWallSegments } from "./panel-actions.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const IMAGE_MAX = 2500;
const DEBOUNCE_MS = 150;
const PREVIEW_COLOR = 0xff6400;
const PREVIEW_WIDTH = 3;
const DEFAULTS = Object.freeze({ threshold: 0.28, minSquares: 0.5 });

function previewLayer() {
  return canvas.interface ?? canvas.controls ?? canvas.stage;
}

function drawPreview(graphics, segments) {
  graphics.clear();
  graphics.lineStyle(PREVIEW_WIDTH, PREVIEW_COLOR, 1);
  for (const [x1, y1, x2, y2] of segments) {
    graphics.moveTo(x1, y1);
    graphics.lineTo(x2, y2);
  }
}

export class WallTraceDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  #scene;
  #entry;
  #params = { ...DEFAULTS };
  #image = null;
  #segments = [];
  #graphics = null;
  #timer = null;

  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-wall-trace`,
    classes: ["floorer", "floorer-wall-trace"],
    window: { title: "FLOORER.WallTrace.Title", resizable: false },
    position: { width: 360 },
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
    this.#graphics = previewLayer().addChild(new PIXI.Graphics());
    this.#recompute();
  }

  #readParams() {
    const form = this.element;
    this.#params = {
      threshold: Number(form.querySelector("input[name=threshold]").value),
      minSquares: Number(form.querySelector("input[name=minSquares]").value),
    };
    form.querySelector("output[name=threshold]").textContent = this.#params.threshold.toFixed(2);
    form.querySelector("output[name=minSquares]").textContent = this.#params.minSquares.toFixed(1);
  }

  #onSlide() {
    this.#readParams();
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.#recompute(), DEBOUNCE_MS);
  }

  #recompute() {
    if (!this.#image || !this.rendered) return;
    const level = this.#entry.level;
    const input = { image: this.#image, level, sceneRect: this.#scene.dimensions.sceneRect, gridSize: canvas.grid.size, outline: outlineWallSegments(this.#scene, level.id) };
    this.#segments = traceWallSegments(input, this.#params);
    if (this.#graphics) drawPreview(this.#graphics, this.#segments);
    this.#showCount();
  }

  #showCount() {
    const node = this.element.querySelector(".count");
    if (node) node.textContent = game.i18n.format("FLOORER.WallTrace.Count", { count: this.#segments.length });
    const apply = this.element.querySelector("button[data-action=apply]");
    if (apply) apply.disabled = !this.#segments.length;
  }

  #clearPreview() {
    clearTimeout(this.#timer);
    if (this.#graphics) this.#graphics.destroy();
    this.#graphics = null;
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
