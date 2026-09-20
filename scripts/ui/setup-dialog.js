import { MODULE_ID, SETTINGS } from "../constants.js";
import { getSetting } from "../settings.js";
import { applyLevels, parseImages } from "./apply-levels.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

function readForm(form) {
  const fd = new FormData(form);
  return {
    floorsAbove: Math.max(0, Math.floor(Number(fd.get("floorsAbove")) || 0)),
    basements: Math.max(0, Math.floor(Number(fd.get("basements")) || 0)),
    roof: fd.get("roof") === "on",
    floorHeight: Math.max(1, Number(fd.get("floorHeight")) || 1),
    groundBottom: Number(fd.get("groundBottom")) || 0,
    images: parseImages(fd.get("images") ?? ""),
  };
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
      { action: "cancel", label: "Cancel" },
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
    position: { width: 420 },
    form: { handler: SetupDialog.#onSubmit, closeOnSubmit: true },
    actions: { pickImages: SetupDialog.#onPickImages },
  };

  static PARTS = { form: { template: `modules/${MODULE_ID}/templates/setup.hbs` } };

  async _prepareContext() {
    const grid = canvas.scene?.grid?.distance ?? 5;
    return {
      floorsAbove: 2,
      basements: 0,
      roof: true,
      floorHeight: grid * 2,
      groundBottom: 0,
      sealBasements: getSetting(SETTINGS.SEAL_BASEMENTS),
      images: "",
    };
  }

  static async #onPickImages() {
    const textarea = this.element.querySelector("textarea[name=images]");
    const picker = new foundry.applications.apps.FilePicker.implementation({
      type: "image",
      callback: (path) => {
        textarea.value = textarea.value ? `${textarea.value}\n${path}` : path;
      },
    });
    picker.render(true);
  }

  static async #onSubmit(event, form) {
    const opts = readForm(form);
    if (opts.floorsAbove + opts.basements + (opts.roof ? 1 : 0) === 0) {
      return ui.notifications.warn(game.i18n.localize("FLOORER.Setup.NoLevels"));
    }
    const ok = await applyLevels(canvas.scene, opts, { onConflict: conflictDialog });
    if (ok) Hooks.callAll("floorer.levelsChanged");
  }
}
