import { ISOLATION_ALPHA, SETTINGS } from "../constants.js";
import { bandOf, finiteOrNull } from "../model/floor-plan.js";
import { getSetting, setSetting } from "../settings.js";
import { view } from "./view.js";

const LAYERS = ["regions", "walls", "lighting", "sounds", "tiles"];

function inBand(value, band) {
  if (value === null) return true;
  return value >= (band.bottom ?? -Infinity) && value < (band.top ?? Infinity);
}

function elevationOf(doc) {
  if (typeof doc.elevation === "number") return finiteOrNull(doc.elevation);
  if (doc.elevation && "bottom" in doc.elevation) return finiteOrNull(doc.elevation.bottom);
  return undefined;
}

class Isolation {
  #active = false;

  get enabled() {
    return getSetting(SETTINGS.ISOLATION) !== false;
  }

  async setEnabled(value) {
    await setSetting(SETTINGS.ISOLATION, value);
    this.refreshAll();
  }

  setActive(value) {
    if (this.#active === value) return;
    this.#active = value;
    this.refreshAll();
  }

  alphaFor(doc, activeLevel) {
    if (!activeLevel) return null;
    const home = doc.flags?.floorer?.levelId;
    if (home) return home === activeLevel.id ? null : ISOLATION_ALPHA;
    const elevation = elevationOf(doc);
    if (elevation === undefined) return null;
    return inBand(elevation, bandOf(activeLevel)) ? null : ISOLATION_ALPHA;
  }

  onRefresh(placeable) {
    if (!this.#active || !this.enabled) return;
    const level = view.activeLevel;
    if (!level) return;
    placeable.alpha = this.alphaFor(placeable.document, level) ?? 1;
  }

  refreshAll() {
    for (const name of LAYERS) {
      const layer = canvas?.[name];
      layer?.placeables?.forEach((p) => {
        if (!this.#active || !this.enabled) p.alpha = 1;
        p.renderFlags?.set({ refresh: true });
      });
    }
  }
}

export const isolation = new Isolation();
