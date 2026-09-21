import { MODULE_ID, SETTINGS } from "./constants.js";

const WORLD_BOOL = (key, def) => ({
  name: `FLOORER.Settings.${key}.Name`,
  hint: `FLOORER.Settings.${key}.Hint`,
  scope: "world",
  config: true,
  type: Boolean,
  default: def,
});

export function registerSettings() {
  game.settings.register(MODULE_ID, SETTINGS.MIRROR_HOLES, WORLD_BOOL(SETTINGS.MIRROR_HOLES, true));
  game.settings.register(MODULE_ID, SETTINGS.AUTO_TAG, WORLD_BOOL(SETTINGS.AUTO_TAG, true));
  game.settings.register(MODULE_ID, SETTINGS.SEAL_BASEMENTS, WORLD_BOOL(SETTINGS.SEAL_BASEMENTS, true));
  game.settings.register(MODULE_ID, SETTINGS.AUTO_WALLS, WORLD_BOOL(SETTINGS.AUTO_WALLS, true));
  game.settings.register(MODULE_ID, SETTINGS.PANEL_POSITION, { scope: "client", config: false, type: Object, default: {} });
}

export function getSetting(key) {
  return game.settings.get(MODULE_ID, key);
}

export function setSetting(key, value) {
  return game.settings.set(MODULE_ID, key, value);
}
