import { MODULE_ID } from "../constants.js";
import { applyLevels } from "./apply-levels.js";
import { hasSoleDefaultLevel, imagesFromValues, limitImages, previewRows } from "./setup-form.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

const COUNT_FIELDS = ["floorsAbove", "basements"];
const WATCHED = ["floorsAbove", "basements", "roof", "floorHeight", "groundBottom"];

function readOptions(form) {
  const fd = new FormData(form);
  return {
    floorsAbove: Math.max(0, Math.floor(Number(fd.get("floorsAbove")) || 0)),
    basements: Math.max(0, Math.floor(Number(fd.get("basements")) || 0)),
    roof: fd.get("roof") === "on",
    floorHeight: Math.max(1, Number(fd.get("floorHeight")) || 1),
    groundBottom: Number(fd.get("groundBottom")) || 0,
    adoptDefault: fd.has("adoptDefault") ? fd.get("adoptDefault") === "on" : undefined,
  };
}

function imageValues(form) {
  const values = {};
  form.querySelectorAll("input[name^='image-']").forEach((input) => {
    values[input.name.slice("image-".length)] = input.value.trim();
  });
  return values;
}

function readForm(form) {
  const opts = readOptions(form);
  return { ...opts, images: imagesFromValues(imageValues(form), opts) };
}

function levelCount(opts) {
  return opts.floorsAbove + opts.basements + (opts.roof ? 1 : 0);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function previewItem(row) {
  const li = el("li");
  li.dataset.key = row.key;
  li.append(el("span", "name", row.name), el("span", "band", row.band));
  return li;
}

function imageItem(row, value) {
  const li = el("li");
  li.dataset.key = row.key;
  const input = el("input");
  input.type = "text";
  input.name = `image-${row.key}`;
  input.value = value ?? "";
  input.placeholder = game.i18n.localize("FLOORER.Setup.ImagePlaceholder");
  const browse = el("button", "icon");
  browse.type = "button";
  browse.dataset.action = "browse";
  browse.dataset.key = row.key;
  browse.title = game.i18n.localize("FLOORER.Setup.Browse");
  browse.append(el("i", "fas fa-file-image"));
  li.append(el("label", null, row.name), input, browse);
  return li;
}

async function conflictDialog(conflicts) {
  const names = conflicts.map((c) => c.name).join(", ");
  const content = `<p>${game.i18n.format("FLOORER.Setup.Conflict", { names })}</p>`;
  const result = await DialogV2.wait({
    window: { title: "FLOORER.Setup.ConflictTitle" },
    content,
    buttons: [
      { action: "keep", label: "FLOORER.Setup.Keep", default: true },
      { action: "replace", label: "FLOORER.Setup.Replace" },
      { action: "cancel", label: "FLOORER.Common.Cancel" },
    ],
    rejectClose: false,
  });
  return result ?? "cancel";
}

export class SetupDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-setup`,
    classes: ["floorer", "floorer-setup"],
    tag: "form",
    window: { title: "FLOORER.Setup.Title", resizable: false },
    position: { width: 560 },
    form: { handler: SetupDialog.#onSubmit, closeOnSubmit: false },
    actions: { browse: SetupDialog.#onBrowse, step: SetupDialog.#onStep, cancel: SetupDialog.#onCancel },
  };

  static PARTS = { form: { template: `modules/${MODULE_ID}/templates/setup.hbs` } };

  async _prepareContext() {
    const scene = canvas.scene;
    const grid = scene?.grid?.distance ?? 5;
    const opts = { floorsAbove: 2, basements: 0, roof: true, floorHeight: grid * 2, groundBottom: 0 };
    return {
      ...opts,
      id: this.id,
      units: scene?.grid?.units || game.i18n.localize("FLOORER.Setup.Units"),
      rows: previewRows(opts),
      canAdoptDefault: hasSoleDefaultLevel(scene),
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    for (const name of WATCHED) {
      const input = this.element.elements[name];
      input?.addEventListener("input", () => this.#refreshPreview());
      input?.addEventListener("change", () => this.#refreshPreview());
    }
  }

  #refreshPreview() {
    const opts = readOptions(this.element);
    const rows = previewRows(opts);
    const preview = this.element.querySelector(".band-preview");
    preview.replaceChildren(...rows.map(previewItem));
    const values = imageValues(this.element);
    const list = this.element.querySelector(".image-rows");
    list.replaceChildren(...rows.map((row) => imageItem(row, values[row.key])));
    this.#showError(null);
  }

  #showError(key) {
    const node = this.element.querySelector(".error");
    node.hidden = !key;
    node.textContent = key ? game.i18n.localize(key) : "";
  }

  static #onStep(_event, target) {
    const { field, delta } = target.dataset;
    if (!COUNT_FIELDS.includes(field)) return;
    const input = this.element.elements[field];
    input.value = Math.max(0, (Math.floor(Number(input.value)) || 0) + Number(delta));
    this.#refreshPreview();
  }

  static #onBrowse(_event, target) {
    const input = this.element.elements[`image-${target.dataset.key}`];
    if (!input) return;
    const picker = new foundry.applications.apps.FilePicker.implementation({
      type: "image",
      current: input.value || undefined,
      callback: (path) => {
        input.value = path;
      },
    });
    picker.render(true);
  }

  static #onCancel() {
    this.close();
  }

  static async #onSubmit(event, form) {
    const opts = readForm(form);
    const count = levelCount(opts);
    if (count === 0) return this.#showError("FLOORER.Setup.NoLevels");
    const { images, truncated } = limitImages(opts.images, count);
    if (truncated) ui.notifications.warn(game.i18n.localize("FLOORER.Setup.TooManyImages"));
    const ok = await applyLevels(canvas.scene, { ...opts, images }, { onConflict: conflictDialog });
    if (!ok) return;
    Hooks.callAll("floorer.levelsChanged");
    this.close();
  }
}
