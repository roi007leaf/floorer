import { bandsFor, levelName } from "../model/levels.js";
import { bandOf, isManaged } from "../model/floor-plan.js";

export function bandLabelOf(band) {
  return `${band.bottom}–${band.top === null ? "∞" : band.top}`;
}

export function previewRows(opts) {
  return bandsFor(opts)
    .map((band) => ({ key: band.key, name: levelName(band), band: bandLabelOf(band) }))
    .reverse();
}

export function imagesFromValues(values, opts) {
  return bandsFor(opts).map((band) => values[band.key] ?? "");
}

export function hasSoleDefaultLevel(scene) {
  const levels = Array.from(scene?.levels ?? []);
  if (levels.length !== 1 || isManaged(levels[0])) return false;
  const band = bandOf(levels[0]);
  return band.bottom === 0 && band.top === null;
}

export function limitImages(images, levelCount) {
  const truncated = images.length > levelCount;
  return { images: truncated ? images.slice(0, levelCount) : images, truncated };
}
