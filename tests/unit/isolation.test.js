import { isolation } from "../../scripts/canvas/isolation.js";
import { view } from "../../scripts/canvas/view.js";

const f1 = { id: "f1", elevation: { bottom: 0, top: 10 } };
const roof = { id: "r", elevation: { bottom: 20, top: Infinity } };

test("alphaFor dims docs whose floorer home is another level", () => {
  expect(isolation.alphaFor({ flags: { floorer: { levelId: "f2" } } }, f1)).toBe(0.12);
  expect(isolation.alphaFor({ flags: { floorer: { levelId: "f1" } } }, f1)).toBeNull();
});

test("alphaFor dims regions whose bottom lies outside the active band", () => {
  expect(isolation.alphaFor({ elevation: { bottom: 10, top: 20 } }, f1)).toBe(0.12);
  expect(isolation.alphaFor({ elevation: { bottom: -10, top: 0 } }, f1)).toBe(0.12);
  expect(isolation.alphaFor({ elevation: { bottom: 0, top: 10 } }, f1)).toBeNull();
  expect(isolation.alphaFor({ elevation: { bottom: 5, top: 7 } }, f1)).toBeNull();
  expect(isolation.alphaFor({ elevation: { bottom: -Infinity, top: Infinity } }, f1)).toBeNull();
  expect(isolation.alphaFor({ elevation: { bottom: 100, top: Infinity } }, roof)).toBeNull();
  expect(isolation.alphaFor({ elevation: { bottom: 5, top: 10 } }, roof)).toBe(0.12);
});

test("alphaFor dims numeric-elevation docs outside the active band", () => {
  expect(isolation.alphaFor({ elevation: 15 }, f1)).toBe(0.12);
  expect(isolation.alphaFor({ elevation: 10 }, f1)).toBe(0.12);
  expect(isolation.alphaFor({ elevation: 0 }, f1)).toBeNull();
  expect(isolation.alphaFor({ elevation: 9 }, f1)).toBeNull();
  expect(isolation.alphaFor({ elevation: 30 }, roof)).toBeNull();
});

test("alphaFor leaves walls and untyped docs alone", () => {
  expect(isolation.alphaFor({ levels: new Set(["f2"]) }, f1)).toBeNull();
  expect(isolation.alphaFor({}, f1)).toBeNull();
  expect(isolation.alphaFor({ flags: {} }, null)).toBeNull();
});

test("onRefresh dims only when active", () => {
  canvas.level = { id: "f1" };
  canvas.scene = { levels: { get: (id) => (id === "f1" ? f1 : null) } };
  view.sync();
  const p = { document: { elevation: 15 }, alpha: 1 };
  isolation.setActive(false);
  isolation.onRefresh(p);
  expect(p.alpha).toBe(1);
  isolation.setActive(true);
  isolation.onRefresh(p);
  expect(p.alpha).toBe(0.12);
  expect(p.eventMode).toBe("none");
  p.document.elevation = 5;
  p.eventMode = "static";
  isolation.onRefresh(p);
  expect(p.alpha).toBe(1);
  expect(p.eventMode).toBe("static");
  isolation.setActive(false);
});

test("alphaFor keeps stairs visible on both connected levels", () => {
  const active = { id: "f2", elevation: { bottom: 10, top: 20 } };
  const stair = { flags: { floorer: { role: "stair", levelId: "f1", targetLevelId: "f2" } }, elevation: { bottom: 0, top: 10 } };
  expect(isolation.alphaFor(stair, active)).toBeNull();
  expect(isolation.alphaFor(stair, { id: "r", elevation: { bottom: 20, top: null } })).toBe(0.12);
});

test("alphaFor dims outline walls on other floors and shows them at home", () => {
  const wallOn = (levelId) => ({ c: [0, 0, 1, 1], levels: new Set([levelId]), flags: { floorer: { role: "outlineWall", levelId, managed: true } } });
  expect(isolation.alphaFor(wallOn("f1"), f1)).toBeNull();
  expect(isolation.alphaFor(wallOn("f2"), f1)).toBe(0.12);
  expect(isolation.alphaFor(wallOn("f1"), roof)).toBe(0.12);
});
