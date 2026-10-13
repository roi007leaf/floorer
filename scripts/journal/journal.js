const EMBEDDED = Object.freeze({
  levels: "Level",
  regions: "Region",
  tokens: "Token",
  tiles: "Tile",
  walls: "Wall",
  lights: "AmbientLight",
  sounds: "AmbientSound",
  notes: "Note",
  behaviors: "RegionBehavior",
});

const OPTS = { floorerJournal: true };

class Journal {
  #entries = [];
  #sceneId = null;

  get size() {
    return this.#entries.length;
  }

  get sceneId() {
    return this.#sceneId;
  }

  clear() {
    this.#entries = [];
    this.#sceneId = null;
  }

  #syncScene(scene) {
    if (this.#sceneId !== scene.id) this.clear();
    this.#sceneId = scene.id;
  }

  async run(entry, fn) {
    this.#syncScene(entry.scene);
    const result = await fn();
    this.#entries.push(this.#record(entry, result));
    return result;
  }

  #record(entry, result) {
    if (entry.op === "create") return { ...entry, ids: result.map((d) => d.id) };
    const before = Array.isArray(entry.before) ? entry.before : [];
    return { ...entry, ids: before.map((d) => d._id) };
  }

  async #reverse(entry) {
    const name = EMBEDDED[entry.collection];
    const parent = entry.parent ?? entry.scene;
    if (!name) return parent.update(entry.before, OPTS);
    if (entry.op === "create") return parent.deleteEmbeddedDocuments(name, entry.ids, OPTS);
    if (entry.op === "update") return parent.updateEmbeddedDocuments(name, entry.before, OPTS);
    return parent.createEmbeddedDocuments(name, entry.before, { ...OPTS, keepId: true });
  }

  async undo() {
    const entry = this.#entries.pop();
    if (!entry) return false;
    await this.#reverse(entry);
    return true;
  }

  async revert() {
    let n = 0;
    while (await this.undo()) n++;
    return n;
  }
}

export const journal = new Journal();
export const EMBEDDED_NAMES = EMBEDDED;
