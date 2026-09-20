import { MODULE_ID } from "./constants.js";
import { registerSettings } from "./settings.js";
import { view } from "./canvas/view.js";

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | init`);
  registerSettings();
});

Hooks.on("canvasReady", () => {
  if (!game.user?.isGM) return;
  view.sync();
});
