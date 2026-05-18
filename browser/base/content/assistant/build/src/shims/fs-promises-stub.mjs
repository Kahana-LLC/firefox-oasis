/** Stub for railroad-memory FileStorage (unused in browser IndexedDB builds). */
async function unavailable() {
  throw new Error("FileStorage is not available in the Oasis browser bundle");
}
export const readFile = unavailable;
export const writeFile = unavailable;
export const mkdir = unavailable;
export const unlink = unavailable;
export const access = unavailable;
export const readdir = unavailable;
