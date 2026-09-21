import { FloorerPanel } from "./panel.js";

function findAddLevelButton(legend) {
  return legend.querySelector('[data-action="addLevel"]');
}

function buildLaunchButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon inline-control floorer-launch fa-solid fa-layer-group";
  const label = game.i18n.localize("FLOORER.Controls.OpenFromConfig");
  button.dataset.tooltip = label;
  button.setAttribute("aria-label", label);
  return button;
}

function buildHint() {
  const p = document.createElement("p");
  p.className = "hint floorer-hint";
  const label = game.i18n.localize("FLOORER.Controls.ConfigHint");
  const opener = document.createElement("button");
  opener.type = "button";
  opener.className = "floorer-hint-open";
  opener.textContent = game.i18n.localize("FLOORER.Controls.Open");
  p.append(`${label} `, opener);
  return { hint: p, opener };
}

function openOrWarn(app) {
  if (app.document.isView) return FloorerPanel.open();
  return ui.notifications.warn(game.i18n.localize("FLOORER.Controls.ViewSceneFirst"));
}

export function injectSceneConfigButton(app, element) {
  if (!game.user?.isGM) return;
  const legend = element.querySelector('.tab[data-tab="levels"] legend.control');
  if (!legend || legend.querySelector(".floorer-launch")) return;
  const addLevel = findAddLevelButton(legend);
  const button = buildLaunchButton();
  button.addEventListener("click", () => openOrWarn(app));
  if (addLevel) addLevel.after(button);
  else legend.append(button);

  const levelsCount = element.querySelectorAll('.tab[data-tab="levels"] ol.levels li.level').length;
  if (!app.document.isView || levelsCount >= 2) return;
  const { hint, opener } = buildHint();
  opener.addEventListener("click", () => FloorerPanel.open());
  legend.after(hint);
}
