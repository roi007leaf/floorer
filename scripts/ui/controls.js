import { MODULE_ID } from "../constants.js";
import { FloorerPanel } from "./panel.js";

export function registerControls(controls) {
  if (!game.user?.isGM) return;
  controls[MODULE_ID] = {
    name: MODULE_ID,
    title: "FLOORER.Title",
    icon: "fas fa-layer-group",
    order: 100,
    visible: true,
    onChange: () => {},
    tools: {
      open: {
        name: "open",
        title: "FLOORER.Controls.Open",
        icon: "fas fa-layer-group",
        button: true,
        onChange: () => FloorerPanel.toggle(),
      },
    },
    activeTool: "open",
  };
}
