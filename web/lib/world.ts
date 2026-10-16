// Which demo world this browser is in: the shared demo (no id), or a private copy started from the top bar. The id is
// sent as X-KindRed-World on every API call, so the backend reads and writes that copy's own FalkorDB graphs.
const KEY = "kindred.world";

export function worldId(): string | null {
  try { return typeof window === "undefined" ? null : localStorage.getItem(KEY); } catch { return null; }
}
export function setWorld(id: string | null) {
  try { if (id) localStorage.setItem(KEY, id); else localStorage.removeItem(KEY); } catch { /* storage blocked */ }
}
export function worldHeaders(): Record<string, string> {
  const w = worldId();
  return w ? { "X-KindRed-World": w } : {};
}
/** The private copy has expired on the server: go back to the shared demo. */
export function worldExpired() {
  if (!worldId()) return;
  setWorld(null);
  if (typeof window !== "undefined") window.location.reload();
}
