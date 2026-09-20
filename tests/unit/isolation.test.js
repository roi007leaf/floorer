import { isolation } from "../../scripts/canvas/isolation.js";
import { view } from "../../scripts/canvas/view.js";

test("alphaFor", () => {
  expect(isolation.alphaFor({ levels: new Set() }, "a")).toBeNull();
  expect(isolation.alphaFor({}, "a")).toBeNull();
  expect(isolation.alphaFor({ levels: new Set(["a", "b"]) }, "a")).toBeNull();
  expect(isolation.alphaFor({ levels: new Set(["b"]) }, "a")).toBe(0.25);
});

test("onRefresh dims only when active and enabled", () => {
  canvas.level = { id: "a" };
  view.sync();
  game.settings.set("floorer", "isolation", true);
  const p = { document: { levels: new Set(["b"]) }, alpha: 1 };
  isolation.setActive(false);
  isolation.onRefresh(p);
  expect(p.alpha).toBe(1);
  isolation.setActive(true);
  isolation.onRefresh(p);
  expect(p.alpha).toBe(0.25);
  p.document.levels = new Set(["a"]);
  isolation.onRefresh(p);
  expect(p.alpha).toBe(1);
});
