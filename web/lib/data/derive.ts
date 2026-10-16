import type { Actor } from "./workspace";
import type { LoopSummary, Pool } from "./types";

export const route = (cities: string[]) => cities.join(cities.length === 2 ? " ⇄ " : " → ");
export const loopRoute = (l: { pairs: { city: string }[] }) => route(l.pairs.map((p) => p.city));
export const pct = (p: number) => `${Math.round(p * 100)}%`;
export const docName = (d: string) => d.replace(/_/g, " ").replace(/\b(ct|hla|id)\b/g, (m) => m.toUpperCase());

export type Tone = "ok" | "warn" | "bad" | "neutral" | "sim";
export const STATUS: Record<string, { label: string; tone: Tone; hint: string }> = {
  selected: { label: "Chosen this week", tone: "neutral", hint: "Picked in this week's match; hospitals not asked yet" },
  offered: { label: "Hospitals asked", tone: "neutral", hint: "Every hospital in the swap has been asked to take part" },
  testing: { label: "Tests under way", tone: "warn", hint: "Each donation is being tested before surgery" },
  committee: { label: "With the committee", tone: "ok", hint: "Tests passed; the legal committee is checking each family's papers" },
  locked: { label: "Surgery booked", tone: "ok", hint: "Approved and booked" },
  broken: { label: "A test failed", tone: "bad", hint: "One donation failed its test, so the swap can't go ahead as planned" },
  repair: { label: "Fix needs your OK", tone: "bad", hint: "A replacement is ready and waits for a person to approve it" },
};
export const statusOf = (s: string, repairReady = false) => (repairReady ? STATUS.repair : STATUS[s] ?? { label: s, tone: "neutral" as Tone, hint: "" });

/** Who did it: a person, the platform, or a simulated agent. */
export function actorOf(agent: string): Actor {
  if (/\(person\)|coordinator \(|reviewer/i.test(agent)) return "user";
  if (/^exchange$/i.test(agent.trim())) return "system";
  return "agent";
}
export const ACTOR_LABEL: Record<Actor, string> = { user: "Coordinator", system: "System", agent: "Agent" };

export type PairRow = {
  pair_id: string; organ: string; code: string; city: string; published: boolean; missing_docs: number;
  loop: LoopSummary | null; position: number | null;
};

/** Every pair the hospitals have published, with the loop (if any) it currently sits in. */
export function buildPairs(pool: Pool, hospitals: { code: string; pairs: { pair_id: string; organ?: string; published: boolean; missing_docs: number }[] }[]): PairRow[] {
  const where = new Map<string, { loop: LoopSummary; pos: number }>();
  for (const l of pool.loops) {
    if (l.status === "broken" && l.replaced_by) continue;
    l.pairs.forEach((p, pos) => { if (!where.has(p.pair_id) || l.status !== "broken") where.set(p.pair_id, { loop: l, pos }); });
  }
  const city = new Map(pool.hospitals.map((h) => [h.code, h.city]));
  return hospitals.flatMap((h) =>
    h.pairs.map((p) => ({
      pair_id: p.pair_id, organ: p.organ ?? "kidney", code: h.code, city: city.get(h.code) ?? h.code, published: p.published, missing_docs: p.missing_docs,
      loop: where.get(p.pair_id)?.loop ?? null, position: where.get(p.pair_id)?.pos ?? null,
    })),
  ).sort((a, b) => a.pair_id.localeCompare(b.pair_id));
}

export const fmtTime = (t: number) => new Date(t).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
export const fmtDate = (t: number) => new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
export const DAY = 86_400_000;
