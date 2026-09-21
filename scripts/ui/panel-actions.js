import { FLAG_VERSION, INTENTS, ROLES } from "../constants.js";
import { EMBEDDED_NAMES, journal } from "../journal/journal.js";
import { intents } from "../canvas/intents.js";
import { surfaceCreateData, wholeSceneShape } from "../model/regions.js";
import { bandOf, findLevel } from "../model/floor-plan.js";
import { bandChangeUpdates } from "../model/band-edit.js";

function bandLabel(level) {
  const band = bandOf(level);
  return `${band.bottom ?? "-∞"}–${band.top ?? "∞"}`;
}

function isSealed(entry) {
  const vis = Array.from(entry.level.visibility?.levels ?? []);
  return vis.length === 1 && vis[0] === entry.level.id;
}

function defaultTargetId(entry) {
  return entry.above?.level.id ?? entry.below?.level.id ?? null;
}

function targetsFor(entry, plan) {
  const def = defaultTargetId(entry);
  return plan.levels
    .filter((e) => e !== entry)
    .map((e) => ({ id: e.level.id, name: e.level.name, selected: e.level.id === def }))
    .reverse();
}

function aggregateIssues(plan, issues) {
  const overlaps = issues.filter((i) => i.id === "level-overlap");
  if (overlaps.length === 0) return issues;
  const levels = overlaps.map((i) => findLevel(plan, i.docId)?.level.name ?? i.docId).join(", ");
  const merged = { ...overlaps[0], label: "FLOORER.Issue.level-overlap-with", levels };
  return issues.filter((i) => i.id !== "level-overlap").concat(merged);
}

function dedupeStairLinks(ids, plan) {
  const grouped = new Map();
  for (const id of ids) {
    const entry = findLevel(plan, id);
    const level = entry?.level;
    if (!level) continue;
    const key = level.name;
    if (!grouped.has(key)) {
      grouped.set(key, { level, count: 0 });
    }
    grouped.get(key).count++;
  }
  return Array.from(grouped.values())
    .map(({ level, count }) => `\u2194 ${level.name}${count > 1 ? ` \u00d7${count}` : ""}`)
    .join(", ");
}

function stairLinks(entry, plan) {
  const owned = entry.stairs.map((s) => s.flags?.floorer?.targetLevelId);
  const arriving = entry.arrivingStairs.map((s) => s.flags?.floorer?.levelId);
  return dedupeStairLinks([...owned, ...arriving], plan);
}

function inputValue(v) {
  return v === null || v === undefined ? "" : String(v);
}

function bandInputs(level, editing, draft) {
  const band = editing && draft ? draft : bandOf(level);
  return { editingBand: editing, bandBottom: inputValue(band.bottom), bandTop: inputValue(band.top) };
}

function row(entry, plan, activeLevelId, issues, { editingBandId, bandDraft }) {
  const holes = entry.surface?.flags?.floorer?.holes ?? [];
  return {
    id: entry.level.id,
    name: entry.level.name,
    band: bandLabel(entry.level),
    ...bandInputs(entry.level, entry.level.id === editingBandId, bandDraft),
    active: entry.level.id === activeLevelId,
    managed: entry.managed,
    hasSurface: !!entry.surface,
    holeCount: holes.filter((h) => !h.stairId).length,
    openingCount: holes.filter((h) => h.stairId).length,
    stairCount: entry.stairs.length + entry.arrivingStairs.length,
    stairLinks: stairLinks(entry, plan),
    sealed: isSealed(entry),
    targets: targetsFor(entry, plan),
    defaultTargetId: defaultTargetId(entry),
    issues: aggregateIssues(plan, issues.filter((i) => i.levelId === entry.level.id)),
  };
}

export function issueKey(issue) {
  return `${issue.id}:${issue.levelId}:${issue.docId ?? ""}`;
}

function isAutoFix(issue) {
  return !!issue.fix && !issue.fix.intent && !issue.fix.prompt;
}

function intentContext(plan, intent) {
  if (!intent) return null;
  return { ...intent, levelName: findLevel(plan, intent.levelId)?.level.name ?? intent.levelId };
}

export function panelContext(plan, { activeLevelId, issues, intent, journalSize, isolationEnabled, editingBandId = null, bandDraft = null }) {
  const decorated = issues.map((i) => ({ ...i, fixable: !!i.fix, key: issueKey(i) }));
  return {
    sceneName: plan.scene?.name ?? "",
    rows: plan.levels.map((e) => row(e, plan, activeLevelId, decorated, { editingBandId, bandDraft })).reverse(),
    issues: decorated,
    issueCount: decorated.length,
    autoFixCount: decorated.filter(isAutoFix).length,
    intent: intentContext(plan, intent),
    journalSize,
    isolationEnabled,
  };
}

function elevationBefore(doc) {
  const inclusive = doc.elevation?.topInclusive;
  return { ...bandOf(doc), ...(inclusive === undefined ? {} : { topInclusive: inclusive }) };
}

function fieldBefore(doc, key) {
  if (key === "elevation") return elevationBefore(doc);
  if (key === "levels") return Array.from(doc.levels);
  return foundry.utils.deepClone(key.includes(".") ? foundry.utils.getProperty(doc, key) : doc[key]);
}

function docBefore(scene, collection, data) {
  const doc = scene[collection].get(data._id);
  const before = { _id: data._id };
  for (const key of Object.keys(data)) {
    if (key !== "_id") before[key] = fieldBefore(doc, key);
  }
  return before;
}

async function runUpdates(scene, collection, updates, before) {
  if (!updates.length) return;
  const name = EMBEDDED_NAMES[collection];
  await journal.run({ op: "update", collection, scene, before }, () => scene.updateEmbeddedDocuments(name, updates));
}

async function applyUpdateFix(scene, fix) {
  const { ids, ...data } = fix.data;
  await runUpdates(scene, fix.collection, [data], [docBefore(scene, fix.collection, data)]);
  const cascade = fix.cascade ?? [];
  await runUpdates(scene, "regions", cascade, cascade.map((d) => docBefore(scene, "regions", d)));
}

export async function applyBandChange(scene, plan, levelId, band) {
  const { levels, regions, tokens, before } = bandChangeUpdates(plan, levelId, band);
  await runUpdates(scene, "levels", levels, before.levels);
  await runUpdates(scene, "regions", regions, before.regions);
  await runUpdates(scene, "tokens", tokens, before.tokens);
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
