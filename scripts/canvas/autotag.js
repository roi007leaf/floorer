import { SETTINGS } from "../constants.js";
import { getSetting } from "../settings.js";
import { view } from "./view.js";

const ELEVATED = new Set(["tile", "sound", "note", "light"]);

function levelsOf(data) {
  return Array.from(data.levels ?? []);
}

function onlyActive(levels, id) {
  return levels.length === 1 && levels[0] === id;
}

function lightData(data, level) {
  const levels = levelsOf(data);
  const out = {};
  if (levels.length === 1) out.levels = [];
  if (levels.length <= 1 && data.elevation !== level.elevation.base) out.elevation = level.elevation.base;
  return Object.keys(out).length ? out : null;
}

function taggedData(kind, data, level) {
  const levels = levelsOf(data);
  const out = {};
  if (levels.length === 0) out.levels = [level.id];
  else if (!onlyActive(levels, level.id)) return null;
  if (ELEVATED.has(kind) && data.elevation !== level.elevation.base) out.elevation = level.elevation.base;
  return Object.keys(out).length ? out : null;
}

class AutoTag {
  #enabled = () => false;

  setEnabledPredicate(fn) {
    this.#enabled = fn;
  }

  tagData(kind, data, level) {
    return kind === "light" ? lightData(data, level) : taggedData(kind, data, level);
  }

  onPreCreate(kind, doc, data, options, userId) {
    if (userId !== game.user.id || !this.#enabled() || !getSetting(SETTINGS.AUTO_TAG)) return;
    view.sync();
    const level = view.activeLevel;
    if (!level) return;
    const changes = this.tagData(kind, data, level);
    if (changes) doc.updateSource(changes);
  }
}

export const autotag = new AutoTag();
