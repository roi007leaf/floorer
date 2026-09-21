global.game = {
  user: { id: "gm1", isGM: true },
  i18n: { localize: (k) => k, format: (k, d) => `${k}:${JSON.stringify(d)}` },
  settings: { store: new Map(), get(m, k) { return this.store.get(`${m}.${k}`); }, set(m, k, v) { this.store.set(`${m}.${k}`, v); }, register() {} },
};
global.ui = { notifications: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } };
global.Hooks = { on: jest.fn(), once: jest.fn(), off: jest.fn(), callAll: jest.fn(), call: jest.fn() };
global.foundry = { utils: { randomID: () => Math.random().toString(36).slice(2, 18), deepClone: (o) => JSON.parse(JSON.stringify(o)), mergeObject: (a, b) => ({ ...a, ...b }) } };
global.CONFIG = { Token: { movement: { actions: { walk: {}, fly: {}, climb: {}, swim: {}, burrow: {}, crawl: {}, jump: {}, blink: {}, displace: {} } } } };
global.canvas = { level: null, scene: null, canvasCoordinatesFromClient: ({ x, y }) => ({ x, y }) };
