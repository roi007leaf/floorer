import { view } from "../../scripts/canvas/view.js";

test("sync reads canvas.level and notifies on change", () => {
  const fn = jest.fn();
  const off = view.onChange(fn);
  canvas.level = { id: "a" };
  view.sync();
  expect(view.activeLevelId).toBe("a");
  expect(fn).toHaveBeenCalledWith("a");
  view.sync();
  expect(fn).toHaveBeenCalledTimes(1);
  off();
  canvas.level = { id: "b" };
  view.sync();
  expect(fn).toHaveBeenCalledTimes(1);
});

test("setLevel calls scene.view", async () => {
  canvas.scene = { view: jest.fn(async () => {}) };
  await view.setLevel("z");
  expect(canvas.scene.view).toHaveBeenCalledWith({ level: "z" });
});
