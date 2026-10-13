import { activeStateId, addStateData, behaviorStateUpdates, missingVariantBehaviors, removeStateData, renameStateData, sceneStates, stateApplyUpdates, stateById, variantBehaviorData, variantLevelIds, variantsOf } from "../../scripts/model/states.js";

const scene = (states, activeState) => ({ flags: { floorer: { states, activeState } } });
const stair = (id, variants, behaviors = [], managed = true) => ({ id, behaviors, flags: { floorer: { role: "stair", managed, variants } } });
const planOf = (stairs) => ({ levels: [{ stairs }] });

test("sceneStates and activeStateId tolerate missing or malformed flags", () => {
  expect(sceneStates(undefined)).toEqual([]);
  expect(sceneStates({})).toEqual([]);
  expect(sceneStates(scene("nope"))).toEqual([]);
  expect(sceneStates(scene([{ id: "a", name: "Upright" }]))).toEqual([{ id: "a", name: "Upright" }]);
  expect(activeStateId(undefined)).toBeNull();
  expect(activeStateId(scene([]))).toBeNull();
  expect(activeStateId(scene([], "a"))).toBe("a");
});

test("stateById matches on id first, then on exact name", () => {
  const s = scene([{ id: "a", name: "b" }, { id: "b", name: "Rolled" }]);
  expect(stateById(s, "a").name).toBe("b");
  expect(stateById(s, "b").id).toBe("b");
  expect(stateById(s, "Rolled").id).toBe("b");
  expect(stateById(s, "rolled")).toBeNull();
  expect(stateById(s, "zz")).toBeNull();
});

test("addStateData appends a state with a fresh id", () => {
  const data = addStateData(scene([{ id: "a", name: "Upright" }]), "Rolled");
  expect(data["flags.floorer.states"]).toHaveLength(2);
  expect(data["flags.floorer.states"][1]).toEqual({ id: expect.any(String), name: "Rolled" });
  expect(addStateData({}, "First")["flags.floorer.states"]).toEqual([{ id: expect.any(String), name: "First" }]);
});

test("renameStateData rewrites only the named state", () => {
  const data = renameStateData(scene([{ id: "a", name: "Upright" }, { id: "b", name: "Rolled" }]), "b", "To port");
  expect(data["flags.floorer.states"]).toEqual([{ id: "a", name: "Upright" }, { id: "b", name: "To port" }]);
});

test("removeStateData drops the state and keeps an unrelated active state", () => {
  const data = removeStateData(scene([{ id: "a", name: "A" }, { id: "b", name: "B" }], "a"), "b");
  expect(data).toEqual({ "flags.floorer.states": [{ id: "a", name: "A" }] });
});

test("removing the active state moves active to the first remaining, or null", () => {
  const moved = removeStateData(scene([{ id: "a", name: "A" }, { id: "b", name: "B" }], "a"), "a");
  expect(moved["flags.floorer.states"]).toEqual([{ id: "b", name: "B" }]);
  expect(moved["flags.floorer.activeState"]).toBe("b");
  const cleared = removeStateData(scene([{ id: "a", name: "A" }], "a"), "a");
  expect(cleared).toEqual({ "flags.floorer.states": [], "flags.floorer.activeState": null });
});

test("variantsOf and variantLevelIds", () => {
  expect(variantsOf(undefined)).toEqual({});
  expect(variantsOf({ flags: { floorer: {} } })).toEqual({});
  const s = stair("st", { a: { kind: "level", levelId: "f2" }, b: { kind: "scene", sceneId: "sc", regionId: "rg" }, c: { kind: "off" }, d: { kind: "level" } });
  expect(variantsOf(s).a).toEqual({ kind: "level", levelId: "f2" });
  expect(variantLevelIds(s)).toEqual(["f2"]);
  expect(variantLevelIds(stair("st", {}))).toEqual([]);
});

test("variantBehaviorData builds changeLevel, teleportToken or nothing", () => {
  expect(variantBehaviorData({ kind: "level", levelId: "f2" }, "s1", { actions: ["walk", "displace"] })).toEqual({
    type: "changeLevel",
    system: { movementActions: ["walk"] },
    flags: { floorer: { stateId: "s1" } },
  });
  expect(variantBehaviorData({ kind: "scene", sceneId: "sc", regionId: "rg" }, "s1")).toEqual({
    type: "teleportToken",
    system: { destinations: ["Scene.sc.Region.rg"], placement: "center", choice: false },
    flags: { floorer: { stateId: "s1" } },
  });
  expect(variantBehaviorData({ kind: "scene", sceneId: "sc", regionId: "rg", placement: "random" }, "s1").system.placement).toBe("random");
  expect(variantBehaviorData({ kind: "off" }, "s1")).toBeNull();
  expect(variantBehaviorData(undefined, "s1")).toBeNull();
});

const beh = (id, stateId, disabled) => ({ id, disabled, flags: stateId === null ? {} : { floorer: { stateId } } });

test("behaviorStateUpdates enables only the behavior serving the active state", () => {
  const s = stair("st", { s1: { kind: "level", levelId: "f2" }, s2: { kind: "level", levelId: "f3" } }, [beh("b1", "s1", true), beh("b2", "s2", false)]);
  expect(behaviorStateUpdates(s, "s1")).toEqual([{ _id: "b1", disabled: false }, { _id: "b2", disabled: true }]);
});

test("behaviorStateUpdates only emits behaviors whose disabled actually changes", () => {
  const s = stair("st", { s1: { kind: "level", levelId: "f2" } }, [beh("b1", "s1", false), beh("b2", "s2", true)]);
  expect(behaviorStateUpdates(s, "s1")).toEqual([]);
});

test("a behavior with no stateId is enabled only while the stair has no variants", () => {
  expect(behaviorStateUpdates(stair("st", {}, [beh("b0", null, true)]), "s1")).toEqual([{ _id: "b0", disabled: false }]);
  expect(behaviorStateUpdates(stair("st", { s1: { kind: "off" } }, [beh("b0", null, false)]), "s1")).toEqual([{ _id: "b0", disabled: true }]);
  expect(behaviorStateUpdates(stair("st", undefined, [beh("b0", null, false)]), null)).toEqual([]);
});

test("behaviorStateUpdates disables every behavior when no state is active", () => {
  const s = stair("st", { s1: { kind: "level", levelId: "f2" } }, [beh("b1", "s1", false)]);
  expect(behaviorStateUpdates(s, null)).toEqual([{ _id: "b1", disabled: true }]);
});

test("stateApplyUpdates covers every managed stair with variants and skips the unchanged", () => {
  const withVariants = stair("a", { s1: { kind: "level", levelId: "f2" } }, [beh("b1", "s1", true)]);
  const legacy = stair("b", undefined, [beh("b2", null, false)]);
  const settled = stair("c", { s1: { kind: "off" } }, [beh("b3", "s1", false)]);
  const unmanaged = stair("d", { s1: { kind: "level", levelId: "f2" } }, [beh("b4", "s1", true)], false);
  expect(stateApplyUpdates(planOf([withVariants, legacy, settled, unmanaged]), "s1")).toEqual([{ regionId: "a", updates: [{ _id: "b1", disabled: false }] }]);
});

test("missingVariantBehaviors lists create data only for uncovered, non-off variants", () => {
  const s = stair("st", { s1: { kind: "level", levelId: "f2" }, s2: { kind: "scene", sceneId: "sc", regionId: "rg" }, s3: { kind: "off" } }, [beh("b1", "s1", false)]);
  const out = missingVariantBehaviors(s, { actions: ["walk"] });
  expect(out).toEqual([{ type: "teleportToken", system: { destinations: ["Scene.sc.Region.rg"], placement: "center", choice: false }, flags: { floorer: { stateId: "s2" } } }]);
  expect(missingVariantBehaviors(stair("st", {}))).toEqual([]);
});
