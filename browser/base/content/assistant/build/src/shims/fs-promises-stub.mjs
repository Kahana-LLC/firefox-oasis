/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

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
