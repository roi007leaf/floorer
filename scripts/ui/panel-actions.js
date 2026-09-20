import { FLAG_VERSION, INTENTS, ROLES } from "../constants.js";
import { journal } from "../journal/journal.js";
import { intents } from "../canvas/intents.js";
import { surfaceCreateData, wholeSceneShape } from "../model/regions.js";

function bandLabel(level) {
  const top = level.elevation.top ?? "∞";
  const bottom = level.elevation.bottom ?? "-∞";
  return `${bottom}–${top}`;
}

function isSealed(entry) {
  const vis = Array.from(entry.level.visibility?.levels ?? []);
  return vis.length === 1 && vis[0] === entry.level.id;
}

function targetsFor(entry, plan) {
  return plan.levels.filter((e) => e !== entry).map((e) => ({ id: e.level.id, name: e.level.name })).reverse();
}

function row(entry, plan, activeLevelId) {
  return {
    id: entry.level.id,
    name: entry.level.name,
    band: bandLabel(entry.level),
    active: entry.level.id === activeLevelId,
    managed: entry.managed,
    hasSurface: !!entry.surface,
    holeCount: entry.surface?.flags?.floorer?.holes?.length ?? 0,
    stairCount: entry.stairs.length,
    sealed: isSealed(entry),
    targets: targetsFor(entry, plan),
  };
}

export function issueKey(issue) {
  return `${issue.id}:${issue.levelId}:${issue.docId ?? ""}`;
}

export function panelContext(plan, { activeLevelId, issues, intent, journalSize, isolationEnabled }) {
  return {
    sceneName: plan.scene?.name ?? "",
    rows: plan.levels.map((e) => row(e, plan, activeLevelId)).reverse(),
    issues: issues.map((i) => ({ ...i, fixable: !!i.fix, key: issueKey(i) })),
    intent,
    journalSize,
    isolationEnabled,
  };
}

function regionBefore(scene, data) {
  const doc = scene.regions.get(data._id);
  const before = { _id: data._id };
  for (const key of Object.keys(data)) {
    if (key === "_id") continue;
    before[key] = key.includes(".") ? foundry.utils.deepClone(foundry.utils.getProperty(doc, key)) : foundry.utils.deepClone(key === "levels" ? Array.from(doc.levels) : doc[key]);
  }
  return before;
}

async function applyUpdateFix(scene, fix) {
  const { ids, ...data } = fix.data;
  const before = [regionBefore(scene, data)];
  await journal.run({ op: "update", collection: fix.collection, scene, before }, () => scene.updateEmbeddedDocuments("Region", [data]));
}

async function retargetStair(scene, docId, plan) {
  const { DialogV2 } = foundry.applications.api;
  const options = plan.levels.map((e) => `<option value="${e.level.id}">${e.level.name}</option>`).join("");
  const targetId = await DialogV2.prompt({
    window: { title: "FLOORER.Panel.PickTarget" },
    content: `<select name="target">${options}</select>`,
    ok: { callback: (_e, button) => button.form.elements.target.value },
    rejectClose: false,
  });
  if (!targetId) return;
  const before = [{ _id: docId, "flags.floorer.targetLevelId": scene.regions.get(docId).flags.floorer.targetLevelId }];
  await journal.run({ op: "update", collection: "regions", scene, before }, () => scene.updateEmbeddedDocuments("Region", [{ _id: docId, "flags.floorer.targetLevelId": targetId }]));
}

export async function applyFix(scene, issue, plan) {
  const fix = issue.fix;
  if (!fix) return;
  if (fix.intent) return intents.arm({ kind: fix.intent, levelId: fix.levelId, tool: "polygon" });
  if (fix.prompt === "stair-target") return retargetStair(scene, fix.docId, plan);
  return applyUpdateFix(scene, fix);
}

export async function wholeSceneSurface(scene, entry, allLevels) {
  const data = surfaceCreateData(entry.level, allLevels, [wholeSceneShape(scene.dimensions.sceneRect)]);
  await journal.run({ op: "create", collection: "regions", scene }, () => scene.createEmbeddedDocuments("Region", [data]));
}

export async function adoptLevel(scene, level) {
  const before = [{ _id: level.id, flags: foundry.utils.deepClone(level.flags ?? {}) }];
  const flags = { floorer: { role: ROLES.LEVEL, kind: "floor", managed: true, v: FLAG_VERSION } };
  await journal.run({ op: "update", collection: "levels", scene, before }, () => scene.updateEmbeddedDocuments("Level", [{ _id: level.id, flags }]));
}

export async function renameLevel(scene, level, name) {
  if (!name || name === level.name) return;
  const before = [{ _id: level.id, name: level.name }];
  await journal.run({ op: "update", collection: "levels", scene, before }, () => scene.updateEmbeddedDocuments("Level", [{ _id: level.id, name }]));
}

export function armDraw(kind, levelId, tool, targetLevelId) {
  intents.arm({ kind, levelId, tool, targetLevelId });
}

export { INTENTS };
