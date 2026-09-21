import { MODULE_ID } from "./constants.js";
import { registerSettings } from "./settings.js";
import { view } from "./canvas/view.js";
import { autotag } from "./canvas/autotag.js";
import { isolation } from "./canvas/isolation.js";
import { intents } from "./canvas/intents.js";
import { registerControls } from "./ui/controls.js";

let escBound = false;

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | init`);
  registerSettings();
  view.onChange(() => isolation.refreshAll());
});

Hooks.on("canvasReady", () => {
  if (!game.user?.isGM) return;
  view.sync();
  isolation.refreshAll();
  if (!escBound) {
    escBound = true;
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") intents.clear();
    });
  }
});

Hooks.on("preCreateRegion", (doc, data, options, userId) => {
  if (!game.user?.isGM) return;
  return intents.onPreCreateRegion(doc, data, options, userId);
});
Hooks.on("createRegion", (doc, options, userId) => {
  if (!game.user?.isGM) return;
  intents.onCreateRegion(doc, options, userId);
});
Hooks.on("activateSceneControls", () => intents.onSceneControls());
Hooks.on("getSceneControlButtons", registerControls);

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
