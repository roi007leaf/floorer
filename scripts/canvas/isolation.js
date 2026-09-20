import { ISOLATION_ALPHA, SETTINGS } from "../constants.js";
import { getSetting, setSetting } from "../settings.js";
import { view } from "./view.js";

const LAYERS = ["regions", "walls", "lighting", "sounds"];

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

  alphaFor(doc, activeLevelId) {
    const levels = doc.levels ? Array.from(doc.levels) : [];
    if (!levels.length || levels.includes(activeLevelId)) return null;
    return ISOLATION_ALPHA;
  }

  onRefresh(placeable) {
    if (!this.#active || !this.enabled || !view.activeLevelId) return;
    placeable.alpha = this.alphaFor(placeable.document, view.activeLevelId) ?? 1;
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
