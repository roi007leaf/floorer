import { MODULE_ID, ROLES, INTENTS, FLAG_VERSION } from "../../scripts/constants.js";

test("constants", () => {
  expect(MODULE_ID).toBe("floorer");
  expect(FLAG_VERSION).toBe(1);
  expect(ROLES.SURFACE).toBe("surface");
  expect(INTENTS.HOLE).toBe("hole");
});
