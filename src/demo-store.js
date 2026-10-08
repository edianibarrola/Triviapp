import { newGame, command } from './engine.js';
const KEY = 'triviapp.practice.v1';

export class DemoStore {
  constructor(storage) { this.storage = storage; }
  get backend() { return this.storage || localStorage; }
  async load() {
    const raw = this.backend.getItem(KEY);
    if (!raw) return newGame();
    const state = JSON.parse(raw);
    if (state.version !== 1 || !Array.isArray(state.rounds) || !Array.isArray(state.teams)) throw new Error('Saved demo cannot be read. Reset the demo to start again.');
    return state;
  }
  async execute(action, revision) {
    const run = async () => {
      const state = await this.load();
      if (state.revision !== revision) throw new Error('Another tab changed this game. Refresh your view and try again.');
      const updated = command(state, action);
      this.backend.setItem(KEY, JSON.stringify(updated)); // Throw before claiming success on storage failure.
      return updated;
    };
    return globalThis.navigator?.locks ? navigator.locks.request(KEY, run) : run();
  }
  async reset() { const state = newGame(); this.backend.setItem(KEY, JSON.stringify(state)); return state; }
}

export function subscribe(onChange) {
  const listener = e => { if (e.key === KEY) onChange(); };
  addEventListener('storage', listener);
  return () => removeEventListener('storage', listener);
}
