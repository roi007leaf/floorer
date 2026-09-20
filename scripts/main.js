import { MODULE_ID } from "./constants.js";
import { registerSettings } from "./settings.js";
import { view } from "./canvas/view.js";
import { autotag } from "./canvas/autotag.js";
import { isolation } from "./canvas/isolation.js";

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | init`);
  registerSettings();
  view.onChange(() => isolation.refreshAll());
});

Hooks.on("canvasReady", () => {
  if (!game.user?.isGM) return;
  view.sync();
  isolation.refreshAll();
});

for (const hook of ["refreshRegion", "refreshWall", "refreshAmbientLight", "refreshAmbientSound"]) {
  Hooks.on(hook, (placeable) => {
    if (!game.user?.isGM) return;
    isolation.onRefresh(placeable);
  });
}

const AUTO_TAG_HOOKS = { preCreateWall: "wall", preCreateTile: "tile", preCreateAmbientSound: "sound", preCreateNote: "note", preCreateAmbientLight: "light" };
for (const [hook, kind] of Object.entries(AUTO_TAG_HOOKS)) {
  Hooks.on(hook, (doc, data, options, userId) => {
    if (!game.user?.isGM) return;
    autotag.onPreCreate(kind, doc, data, options, userId);
  });
}
