import { FLAG_VERSION, INTENTS, ROLES } from "../constants.js";
import { EMBEDDED_NAMES, journal } from "../journal/journal.js";
import { intents } from "../canvas/intents.js";
import { stairIndexUpdates, surfaceCreateData } from "../model/regions.js";
import { footprintShapesForLevel } from "./footprint.js";
import { bandOf, findLevel } from "../model/floor-plan.js";
import { bandChangeUpdates } from "../model/band-edit.js";
import { shapeCenter, shapeSummary } from "../model/shapes.js";
import { holeRemovalUpdates, stairRemovalUpdates } from "../model/holes.js";
import { stairRetargetUpdates } from "../model/stair-retarget.js";
import { levelRemovalPlan } from "../model/level-remove.js";
import { view } from "../canvas/view.js";
import { isSealed, sealUpdates } from "../model/visibility.js";

function bandLabel(level) {
  const band = bandOf(level);
  return `${band.bottom ?? "-∞"}–${band.top ?? "∞"}`;
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
    .map(({ level, count }) => `${count}\u00d7 ${level.name}`)
    .join(", ");
}

function otherLevelId(stair, entry) {
  const flag = stair.flags?.floorer ?? {};
  return flag.levelId === entry.level.id ? flag.targetLevelId : flag.levelId;
}

function allStairs(entry) {
  return [...entry.stairs, ...entry.arrivingStairs];
}

function stairLinks(entry, plan) {
  return dedupeStairLinks(allStairs(entry).map((s) => otherLevelId(s, entry)), plan);
}

function firstShape(region) {
  return Array.from(region.shapes ?? [])[0] ?? null;
}

function stairCode(stair) {
  const index = stair.flags?.floorer?.index;
  return index === undefined || index === null ? "S?" : `S${index + 1}`;
}

function stairTargets(entry, plan, otherId) {
  return plan.levels
    .filter((e) => e !== entry)
    .map((e) => ({ id: e.level.id, name: e.level.name, selected: e.level.id === otherId }))
    .reverse();
}

function stairItem(stair, entry, plan) {
  const otherId = otherLevelId(stair, entry);
  const other = findLevel(plan, otherId)?.level;
  return {
    id: stair.id,
    levelId: stair.flags?.floorer?.levelId,
    otherLevelId: otherId,
    color: stair.color ?? null,
    code: stairCode(stair),
    targets: stairTargets(entry, plan, otherId),
    jumpTooltip: game.i18n.format("FLOORER.Panel.JumpStair", { level: other?.name ?? "?" }),
    shape: shapeSummary(firstShape(stair)),
  };
}

function holeShapesOf(surface) {
  return Array.from(surface?.shapes ?? []).filter((sh) => (typeof sh.toObject === "function" ? sh.toObject() : sh).hole);
}

function holeItems(entry) {
  const holes = entry.surface?.flags?.floorer?.holes ?? [];
  const shapes = holeShapesOf(entry.surface);
  let n = 0;
  return holes.flatMap((h, i) => (h.stairId ? [] : [{ id: h.id, n: ++n, shape: shapeSummary(shapes[i]) }]));
}

function details(entry, plan, expanded) {
  if (!expanded || expanded.levelId !== entry.level.id) return null;
  if (expanded.kind === "stairs") return { kind: "stairs", items: allStairs(entry).map((s) => stairItem(s, entry, plan)) };
  if (expanded.kind === "holes") return { kind: "holes", items: holeItems(entry) };
  return null;
}

function inputValue(v) {
  return v === null || v === undefined ? "" : String(v);
}

function bandInputs(level, editing, draft) {
  const band = editing && draft ? draft : bandOf(level);
  return { editingBand: editing, bandBottom: inputValue(band.bottom), bandTop: inputValue(band.top) };
}

function row(entry, plan, activeLevelId, issues, { editingBandId, bandDraft, expanded }) {
  const holes = entry.surface?.flags?.floorer?.holes ?? [];
  const detail = details(entry, plan, expanded);
  return {
    details: detail,
    expandedStairs: detail?.kind === "stairs",
    expandedHoles: detail?.kind === "holes",
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
    sealed: isSealed(entry.level),
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

export function panelContext(plan, { activeLevelId, issues, intent, journalSize, editingBandId = null, bandDraft = null, expanded = null }) {
  const decorated = issues.map((i) => ({ ...i, fixable: !!i.fix, key: issueKey(i) }));
  return {
    sceneName: plan.scene?.name ?? "",
    rows: plan.levels.map((e) => row(e, plan, activeLevelId, decorated, { editingBandId, bandDraft, expanded })).reverse(),
    issues: decorated,
    issueCount: decorated.length,
    autoFixCount: decorated.filter(isAutoFix).length,
    intent: intentContext(plan, intent),
    journalSize,
  };
}

function elevationBefore(doc) {
  const inclusive = doc.elevation?.topInclusive;
  return { ...bandOf(doc), ...(inclusive === undefined ? {} : { topInclusive: inclusive }) };
}

function plainShapes(doc) {
  return Array.from(doc.shapes ?? []).map((sh) => (typeof sh.toObject === "function" ? sh.toObject() : foundry.utils.deepClone(sh)));
}

function fieldBefore(doc, key) {
  if (key === "elevation") return elevationBefore(doc);
  if (key === "shapes") return plainShapes(doc);
  if (key === "levels") return Array.from(doc.levels);
  if (key === "color") return doc.color?.css ?? doc.color ?? null;
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

async function promptStairTarget(scene, docId, plan) {
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
  if (fix.prompt === "stair-target") return promptStairTarget(scene, fix.docId, plan);
  return applyUpdateFix(scene, fix);
}

export async function wholeSceneSurface(scene, entry, allLevels) {
  const data = surfaceCreateData(entry.level, allLevels, await footprintShapesForLevel(scene, entry.level));
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

async function removeLevelTokens(scene, tokens) {
  if (!tokens.length) return;
  const updates = tokens.map(({ _id, level, elevation }) => ({ _id, level, elevation }));
  const before = tokens.map(({ _id }) => {
    const token = scene.tokens.get(_id);
    return { _id, level: token.level, elevation: token.elevation };
  });
  await runUpdates(scene, "tokens", updates, before);
}

export async function removeLevel(scene, plan, levelId) {
  const entry = findLevel(plan, levelId);
  if (!entry) return;
  const removal = levelRemovalPlan(plan, levelId);
  if (!removal) return ui.notifications.warn(game.i18n.localize("FLOORER.Panel.CannotRemoveOnlyLevel"));
  const { DialogV2 } = foundry.applications.api;
  const ok = await DialogV2.confirm({
    window: { title: "FLOORER.Panel.RemoveLevelTitle" },
    content: `<p>${game.i18n.format("FLOORER.Panel.ConfirmRemoveLevel", { name: entry.level.name })}</p>`,
    rejectClose: false,
  });
  if (!ok) return;
  await removeLevelTokens(scene, removal.tokens);
  if (scene.initialLevel?.id === levelId) await scene.update({ initialLevel: removal.fallbackId });
  const before = [entry.level.toObject()];
  await journal.run({ op: "delete", collection: "levels", scene, before }, () => scene.deleteEmbeddedDocuments("Level", [levelId]));
}

export function armDraw(kind, levelId, tool, targetLevelId) {
  intents.arm({ kind, levelId, tool, targetLevelId });
}

export { INTENTS };

async function focusLevel(levelId) {
  if (levelId && levelId !== view.activeLevelId) await view.setLevel(levelId);
}

function panTo(center) {
  if (center) canvas.animatePan({ x: center.x, y: center.y });
}

export async function locateRegion(scene, regionId, rowLevelId) {
  const region = scene.regions.get(regionId);
  if (!region) return;
  if (!region.object) await focusLevel(rowLevelId ?? region.flags?.floorer?.levelId);
  panTo(shapeCenter(Array.from(region.shapes)[0]));
  canvas.regions?.activate();
  region.object?.control({ releaseOthers: true });
}

export async function locateHole(scene, entry, holeId) {
  const holes = entry.surface?.flags?.floorer?.holes ?? [];
  const index = holes.findIndex((h) => h.id === holeId);
  if (index < 0) return;
  await focusLevel(entry.level.id);
  panTo(shapeCenter(holeShapesOf(entry.surface)[index]));
}

async function applyHoleRemovals(scene, updates) {
  const data = updates.map(({ removed, ...rest }) => rest);
  await runUpdates(scene, "regions", data, data.map((d) => docBefore(scene, "regions", d)));
}

export async function deleteStair(scene, plan, stairId) {
  const stair = scene.regions.get(stairId);
  if (!stair) return;
  const before = [stair.toObject()];
  await journal.run({ op: "delete", collection: "regions", scene, before }, () => scene.deleteEmbeddedDocuments("Region", [stairId]));
  await applyHoleRemovals(scene, stairRemovalUpdates(plan, stairId));
}

async function applyHoleAdditions(scene, updates) {
  const data = updates.map(({ ids, ...rest }) => rest);
  await runUpdates(scene, "regions", data, data.map((d) => docBefore(scene, "regions", d)));
}

export async function retargetStair(scene, plan, stairId, fromLevelId, targetId) {
  const result = stairRetargetUpdates(plan, stairId, fromLevelId, targetId);
  if (!result) return;
  await runUpdates(scene, "regions", [result.stair], [docBefore(scene, "regions", result.stair)]);
  await applyHoleRemovals(scene, result.surfaceRemovals);
  await applyHoleAdditions(scene, result.surfaceAdditions);
}

export async function deleteHole(scene, plan, holeId) {
  await applyHoleRemovals(scene, holeRemovalUpdates(plan, holeId));
}

export async function assignStairIndices(scene) {
  const updates = stairIndexUpdates(scene.regions);
  await runUpdates(scene, "regions", updates, updates.map((d) => docBefore(scene, "regions", d)));
  return updates.length;
}

export async function applySeal(scene, plan, levelId, sealed) {
  const { levels, regions, before } = sealUpdates(plan, levelId, sealed);
  await runUpdates(scene, "levels", levels, before.levels);
  await runUpdates(scene, "regions", regions, before.regions);
}
