import { loadAlpha } from "../canvas/image-alpha.js";
import { wholeSceneShape } from "../model/regions.js";
import { canTrace, traceFootprint } from "../model/trace.js";

async function tracedShapes(scene, level) {
  if (!canTrace(level)) return null;
  const image = await loadAlpha(level.background.src);
  if (!image) return null;
  return traceFootprint(image, level, scene.dimensions.sceneRect);
}

export async function footprintShapesForLevel(scene, level) {
  const shapes = await tracedShapes(scene, level);
  if (!shapes) return [wholeSceneShape(scene.dimensions.sceneRect)];
  ui.notifications.info(game.i18n.format("FLOORER.Panel.TracedFootprint", { rings: shapes.length }));
  return shapes;
}
