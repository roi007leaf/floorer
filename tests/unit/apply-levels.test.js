import { planLevelChanges, parseImages, reuseUpdate } from "../../scripts/ui/apply-levels.js";

const L = (id, bottom, top, managed) => ({ id, _id: id, name: id, elevation: { bottom, top }, flags: managed === undefined ? {} : { floorer: { role: "level", managed } } });
const opts = { floorsAbove: 2, basements: 0, roof: false, floorHeight: 10, groundBottom: 0, images: ["a.webp", "b.webp"] };

test("fresh scene creates all", () => {
  const out = planLevelChanges({ levels: [] }, opts);
  expect(out.create).toHaveLength(2);
  expect(out.reuse).toEqual([]);
  expect(out.conflicts).toEqual([]);
});

test("matching band reused, managed mismatch conflicts, unmanaged ignored", () => {
  const scene = { levels: [L("x", 0, 10, true), L("y", 50, 60, true), L("z", 70, 80)] };
  const out = planLevelChanges(scene, opts);
  expect(out.create.map((c) => c.name)).toEqual(["L2"]);
  expect(out.reuse[0].existing.id).toBe("x");
  expect(out.reuse[0].data.background.src).toBe("a.webp");
  expect(out.conflicts.map((c) => c.id)).toEqual(["y"]);
});

test("parseImages keeps interior blank lines, drops trailing blanks", () => {
  expect(parseImages("a.webp\n\nb.webp")).toEqual(["a.webp", "", "b.webp"]);
  expect(parseImages("a.webp\n\n")).toEqual(["a.webp"]);
  expect(parseImages("")).toEqual([]);
});

test("live roof with Infinity top is reused, not a conflict", () => {
  const roofOpts = { ...opts, roof: true, images: [] };
  const scene = { levels: [L("x", 0, 10, true), L("y", 10, 20, true), L("r", 20, Infinity, true)] };
  const out = planLevelChanges(scene, roofOpts);
  expect(out.create).toEqual([]);
  expect(out.reuse.map((r) => r.existing.id)).toEqual(["x", "y", "r"]);
  expect(out.conflicts).toEqual([]);
});

const defaultLevel = () => ({ id: "defaultLevel0000", _id: "defaultLevel0000", name: "Default", sort: 0, elevation: { bottom: 0, top: null }, flags: {}, background: {} });

test("sole unmanaged default level is adopted as the ground floor", () => {
  const out = planLevelChanges({ levels: [defaultLevel()] }, opts);
  expect(out.create.map((c) => c.name)).toEqual(["L2"]);
  expect(out.reuse).toHaveLength(1);
  expect(out.reuse[0].existing.id).toBe("defaultLevel0000");
  expect(out.reuse[0].data.name).toBe("L1");
  expect(out.reuse[0].data.flags.floorer.adoptedDefault).toBe(true);
  expect(out.conflicts).toEqual([]);
});

test("live default level with Infinity top is adopted too", () => {
  const live = { ...defaultLevel(), elevation: { bottom: 0, top: Infinity } };
  const out = planLevelChanges({ levels: [live] }, opts);
  expect(out.reuse[0].existing.id).toBe("defaultLevel0000");
});

test("default level adopts the first band when there is no ground floor", () => {
  const out = planLevelChanges({ levels: [defaultLevel()] }, { ...opts, floorsAbove: 0, basements: 1, images: [] });
  expect(out.create).toEqual([]);
  expect(out.reuse[0].data.name).toBe("B1");
});

test("adoption is skipped when adoptDefault is false or other levels exist", () => {
  const off = planLevelChanges({ levels: [defaultLevel()] }, { ...opts, adoptDefault: false });
  expect(off.reuse).toEqual([]);
  expect(off.create).toHaveLength(2);
  const managed = planLevelChanges({ levels: [defaultLevel(), L("y", 50, 60, true)] }, opts);
  expect(managed.reuse).toEqual([]);
  expect(managed.conflicts.map((c) => c.id)).toEqual(["y"]);
});

test("reuseUpdate writes name and elevation only for an adopted default", () => {
  const plain = reuseUpdate({ existing: L("x", 0, 10, true), data: { name: "L1", elevation: { bottom: 0, top: 10 }, sort: 0, flags: { floorer: { role: "level", kind: "floor", managed: true, v: 1 } }, background: { src: "a.webp" } } });
  expect(plain).toEqual({ _id: "x", flags: { floorer: { role: "level", kind: "floor", managed: true, v: 1 } }, sort: 0, background: { src: "a.webp" } });
  const adopted = planLevelChanges({ levels: [defaultLevel()] }, opts).reuse[0];
  const upd = reuseUpdate(adopted);
  expect(upd.name).toBe("L1");
  expect(upd.elevation).toEqual({ bottom: 0, top: 10 });
  expect(upd.background).toEqual({ src: "a.webp" });
});

test("sole unmanaged level with the core 0-20 default band is adopted", () => {
  const core = { ...defaultLevel(), name: "Level", elevation: { bottom: 0, top: 20 } };
  const out = planLevelChanges({ levels: [core] }, opts);
  expect(out.reuse[0].existing.id).toBe("defaultLevel0000");
  expect(out.reuse[0].data.name).toBe("L1");
  expect(out.create.map((c) => c.name)).toEqual(["L2"]);
  expect(out.conflicts).toEqual([]);
});
