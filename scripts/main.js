import { MODULE_ID } from "./constants.js";

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | init`);
});
