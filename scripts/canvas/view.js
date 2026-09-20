class View {
  #activeLevelId = null;
  #listeners = new Set();

  get activeLevelId() {
    return this.#activeLevelId;
  }

  get activeLevel() {
    if (!this.#activeLevelId) return null;
    return canvas.scene?.levels?.get(this.#activeLevelId) ?? null;
  }

  onChange(fn) {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  sync() {
    const id = canvas.level?.id ?? null;
    if (id === this.#activeLevelId) return;
    this.#activeLevelId = id;
    for (const fn of this.#listeners) fn(id);
  }

  async setLevel(id) {
    if (!canvas.scene) return;
    await canvas.scene.view({ level: id });
    this.sync();
  }
}

export const view = new View();
