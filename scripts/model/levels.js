import { FLAG_VERSION, ROLES } from "../constants.js";

export function bandsFor({ floorsAbove, basements, roof, floorHeight, groundBottom }) {
  const h = floorHeight;
  const g = groundBottom;
  const bands = [];
  for (let k = basements; k >= 1; k--) {
    bands.push({ key: `b${k}`, kind: "basement", index: k, bottom: g - k * h, top: g - (k - 1) * h });
  }
  for (let n = 1; n <= floorsAbove; n++) {
    bands.push({ key: `f${n}`, kind: "floor", index: n, bottom: g + (n - 1) * h, top: g + n * h });
  }
  if (roof) bands.push({ key: "roof", kind: "roof", index: 0, bottom: g + floorsAbove * h, top: null });
  return bands;
}

export function levelName(band) {
  if (band.kind === "roof") return "Roof";
  return `${band.kind === "basement" ? "B" : "L"}${band.index}`;
}

function levelFlags(kind) {
  return { floorer: { role: ROLES.LEVEL, kind, managed: true, v: FLAG_VERSION } };
}

export function generateLevelData(opts) {
  const images = opts.images ?? [];
  return bandsFor(opts).map((band, i) => {
    const data = {
      name: levelName(band),
      elevation: { bottom: band.bottom, top: band.top },
      sort: i,
      flags: levelFlags(band.kind),
    };
    if (images[i]) data.background = { src: images[i] };
    return data;
  });
}

function kindOf(level) {
  return level.flags?.floorer?.kind;
}

export function visibilityFor(levels, { sealBasements }) {
  const above = levels.filter((l) => kindOf(l) !== "basement").map((l) => l._id);
  const all = levels.map((l) => l._id);
  return levels.map((l) => {
    const sealed = sealBasements && kindOf(l) === "basement";
    const set = sealed ? [l._id] : sealBasements ? above : all;
    return { _id: l._id, "visibility.levels": [...new Set(set)] };
  });
}
