/** Minimal path.join for FileStorage stub (unused in browser). */
export function join(...parts) {
  return parts.filter(Boolean).join("/").replace(/\/+/g, "/");
}
