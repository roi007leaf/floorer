import { previewRows, imagesFromValues, hasSoleDefaultLevel, limitImages, bandLabelOf } from "../../scripts/ui/setup-form.js";

const opts = { floorsAbove: 2, basements: 1, roof: true, floorHeight: 10, groundBottom: 0 };

test("previewRows lists levels top to bottom with band labels", () => {
  const rows = previewRows(opts);
  expect(rows.map((r) => r.key)).toEqual(["roof", "f2", "f1", "b1"]);
  expect(rows.map((r) => r.name)).toEqual(["Roof", "L2", "L1", "B1"]);
  expect(rows.map((r) => r.band)).toEqual(["20–∞", "10–20", "0–10", "-10–0"]);
});

test("bandLabelOf prints infinity for a null top", () => {
  expect(bandLabelOf({ bottom: 5, top: null })).toBe("5–∞");
  expect(bandLabelOf({ bottom: -5, top: 5 })).toBe("-5–5");
});

test("imagesFromValues builds bottom-to-top images keyed by level", () => {
  const values = { f1: "ground.webp", roof: "roof.webp", b1: "" };
  expect(imagesFromValues(values, opts)).toEqual(["", "ground.webp", "", "roof.webp"]);
  expect(imagesFromValues({}, { ...opts, roof: false, basements: 0 })).toEqual(["", ""]);
});

test("hasSoleDefaultLevel detects the untouched core default level", () => {
  const def = { id: "defaultLevel0000", elevation: { bottom: 0, top: Infinity }, flags: {} };
  expect(hasSoleDefaultLevel({ levels: [def] })).toBe(true);
  expect(hasSoleDefaultLevel({ levels: [def, { id: "x", elevation: { bottom: 0, top: 10 }, flags: {} }] })).toBe(false);
  expect(hasSoleDefaultLevel({ levels: [{ ...def, flags: { floorer: { managed: true } } }] })).toBe(false);
  expect(hasSoleDefaultLevel({ levels: [{ ...def, elevation: { bottom: 0, top: 10 } }] })).toBe(false);
  expect(hasSoleDefaultLevel(null)).toBe(false);
});

test("limitImages truncates extra entries and reports it", () => {
  expect(limitImages(["a", "b", "c"], 2)).toEqual({ images: ["a", "b"], truncated: true });
  expect(limitImages(["a"], 2)).toEqual({ images: ["a"], truncated: false });
});
