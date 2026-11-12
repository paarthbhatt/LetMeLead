import { vi } from "vitest";

/** Keep browser tests independent of Node's experimental global localStorage. */
export function stubLocalStorage(): Storage {
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() { return values.size; },
    clear() { values.clear(); },
    getItem(key) { return values.get(String(key)) ?? null; },
    key(index) { return Array.from(values.keys())[index] ?? null; },
    removeItem(key) { values.delete(String(key)); },
    setItem(key, value) { values.set(String(key), String(value)); },
  };
  vi.stubGlobal("localStorage", storage);
  return storage;
}
