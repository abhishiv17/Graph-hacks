// The reasoning layer's client: step-by-step walkthroughs of a graph (built from graph data on the server) and their
// voice (Sarvam, through the server, so the key never reaches the browser).
import { API } from "@/lib/api";
import { worldHeaders } from "@/lib/world";

export type WalkStep = { text: string; spoken: string; nodes: string[]; edges: string[]; hops: number | null };
export type Walk = { lang: string; steps: WalkStep[]; voice: boolean; source: string };

export const LANGS: [string, string][] = [
  ["en-IN", "English"], ["hi-IN", "हिन्दी"], ["ta-IN", "தமிழ்"], ["te-IN", "తెలుగు"], ["kn-IN", "ಕನ್ನಡ"], ["ml-IN", "മലയാളം"],
  ["bn-IN", "বাংলা"], ["mr-IN", "मराठी"], ["gu-IN", "ગુજરાતી"], ["pa-IN", "ਪੰਜਾਬੀ"], ["od-IN", "ଓଡ଼ିଆ"],
];

async function json<T>(path: string): Promise<T> {
  const r = await fetch(`${API}${path}`, { cache: "no-store", headers: worldHeaders() });
  if (!r.ok) {
    let d = await r.text();
    try { d = JSON.parse(d).detail ?? d; } catch { /* plain text */ }
    throw new Error(String(d));
  }
  return r.json();
}

export const familyWalk = (pair: string, lang: string) => json<Walk>(`/api/families/${encodeURIComponent(pair)}/walkthrough?lang=${lang}`);
export const swapWalk = (loop: string, lang: string) => json<Walk>(`/api/swaps/${encodeURIComponent(loop)}/walkthrough?lang=${lang}`);

/** The sentence read aloud, as an object URL for an <audio>. Cached per text and language for this page. */
const audio = new Map<string, Promise<string>>();
export function speak(text: string, lang: string): Promise<string> {
  const k = `${lang}|${text}`;
  if (!audio.has(k)) {
    const p = fetch(`${API}/api/voice/speak`, { method: "POST", headers: { "Content-Type": "application/json", ...worldHeaders() }, body: JSON.stringify({ text, lang }) })
      .then(async (r) => { if (!r.ok) throw new Error(`voice ${r.status}`); return URL.createObjectURL(await r.blob()); });
    p.catch(() => audio.delete(k));
    audio.set(k, p);
  }
  return audio.get(k)!;
}
