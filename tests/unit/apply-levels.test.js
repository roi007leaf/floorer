import { planLevelChanges, parseImages } from "../../scripts/ui/apply-levels.js";

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
  expect(out.create.map((c) => c.name)).toEqual(["L2 (10|20)"]);
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
