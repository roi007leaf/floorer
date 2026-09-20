import { MODULE_ID } from "./constants.js";
import { registerSettings } from "./settings.js";
import { view } from "./canvas/view.js";
import { autotag } from "./canvas/autotag.js";

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | init`);
  registerSettings();
});

Hooks.on("canvasReady", () => {
  if (!game.user?.isGM) return;
  view.sync();
});

const AUTO_TAG_HOOKS = { preCreateWall: "wall", preCreateTile: "tile", preCreateAmbientSound: "sound", preCreateNote: "note", preCreateAmbientLight: "light" };
for (const [hook, kind] of Object.entries(AUTO_TAG_HOOKS)) {
  Hooks.on(hook, (doc, data, options, userId) => {
    if (!game.user?.isGM) return;
    autotag.onPreCreate(kind, doc, data, options, userId);
  });
}
