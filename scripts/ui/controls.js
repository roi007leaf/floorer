import { MODULE_ID } from "../constants.js";
import { FloorerPanel } from "./panel.js";

export function registerControls(controls) {
  if (!game.user?.isGM) return;
  const tools = controls.regions?.tools;
  if (!tools) return;
  tools[MODULE_ID] = {
    name: MODULE_ID,
    title: "FLOORER.Controls.Open",
    icon: "fas fa-layer-group",
    button: true,
    order: 100,
    visible: game.user.isGM,
    onChange: () => FloorerPanel.toggle(),
  };
}
