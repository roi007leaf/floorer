import { bandOf, findLevel, finiteOrNull, isManaged, orderPair, shaftBand } from "./floor-plan.js";

function regionBand(region) {
  return { ...bandOf(region), topInclusive: region?.elevation?.topInclusive === true };
}

function levelAfter(plan, id, levelId, band) {
  const level = findLevel(plan, id)?.level;
  if (!level) return null;
  return { id: level.id, elevation: level.id === levelId ? band : bandOf(level) };
}

function stairBandAfter(plan, stair, levelId, band) {
  const flag = stair.flags.floorer;
  const from = levelAfter(plan, flag.levelId, levelId, band);
  const target = levelAfter(plan, flag.targetLevelId, levelId, band);
  if (!from || !target) return null;
  const { lower, upper } = orderPair(from, target);
  return { ...shaftBand(lower, upper), topInclusive: true };
}

function taggedStairs(entry) {
  return [...new Set([...entry.stairs, ...entry.arrivingStairs])].filter(isManaged);
}

function regionUpdates(plan, entry, levelId, band) {
  const surface = entry.surface && isManaged(entry.surface) ? [{ region: entry.surface, elevation: { ...band, topInclusive: true } }] : [];
  const stairs = taggedStairs(entry).map((region) => ({ region, elevation: stairBandAfter(plan, region, levelId, band) }));
  return [...surface, ...stairs.filter((s) => s.elevation)];
}

function tokensOn(plan, levelId) {
  return Array.from(plan.scene?.tokens ?? []).filter((t) => t.level === levelId);
}

function tokenUpdates(plan, levelId, oldBottom, bottom) {
  const resting = tokensOn(plan, levelId).filter((t) => finiteOrNull(t.elevation) === oldBottom);
  return {
    tokens: resting.map((t) => ({ _id: t.id, elevation: bottom ?? 0 })),
    before: resting.map((t) => ({ _id: t.id, elevation: t.elevation })),
  };
}

const EMPTY = Object.freeze({ levels: [], regions: [], tokens: [], before: { levels: [], regions: [], tokens: [] } });

export function bandChangeUpdates(plan, levelId, { bottom, top }) {
  const entry = findLevel(plan, levelId);
  if (!entry) return foundry.utils.deepClone(EMPTY);
  const level = entry.level;
  const old = bandOf(level);
  const regions = regionUpdates(plan, entry, levelId, { bottom, top });
  const tokens = tokenUpdates(plan, levelId, old.bottom, bottom);
  return {
    levels: [{ _id: level.id, elevation: { bottom, top } }],
    regions: regions.map(({ region, elevation }) => ({ _id: region.id, elevation })),
    tokens: tokens.tokens,
    before: {
      levels: [{ _id: level.id, elevation: old }],
      regions: regions.map(({ region }) => ({ _id: region.id, elevation: regionBand(region) })),
      tokens: tokens.before,
    },
  };
}

export function bandGaps(plan) {
  const managed = plan.levels.filter((e) => e.managed);
  const out = [];
  for (let i = 1; i < managed.length; i++) {
    const lower = bandOf(managed[i - 1].level);
    const upper = bandOf(managed[i].level);
    if (lower.top === null || upper.bottom === null || upper.bottom <= lower.top) continue;
    out.push({ lowerId: managed[i - 1].level.id, upperId: managed[i].level.id, gap: upper.bottom - lower.top });
  }
  return out;
}

function parseEnd(raw) {
  const text = String(raw ?? "").trim();
  if (text === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : undefined;
}

export function parseBand({ bottom, top }) {
  const b = parseEnd(bottom);
  const t = parseEnd(top);
  if (b === undefined || t === undefined) return null;
  if (b !== null && t !== null && b > t) return null;
  return { bottom: b, top: t };
}
