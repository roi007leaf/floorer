const EMBEDDED = Object.freeze({
  levels: "Level",
  regions: "Region",
  tiles: "Tile",
  walls: "Wall",
  lights: "AmbientLight",
  sounds: "AmbientSound",
  notes: "Note",
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
    const ids = entry.op === "create" ? result.map((d) => d.id) : (entry.before ?? []).map((d) => d._id);
    return { ...entry, ids };
  }

  async #reverse(entry) {
    const name = EMBEDDED[entry.collection];
    const scene = entry.scene;
    if (entry.op === "create") return scene.deleteEmbeddedDocuments(name, entry.ids, OPTS);
    if (entry.op === "update") return scene.updateEmbeddedDocuments(name, entry.before, OPTS);
    return scene.createEmbeddedDocuments(name, entry.before, { ...OPTS, keepId: true });
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
