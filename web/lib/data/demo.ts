// Offline stand-in for the FastAPI backend. It replays responses recorded from the real backend
// (lib/demo/snapshot.json, captured by running the demo story against FalkorDB), so every ID, link
// and reason matches what the live system produced. Actions move through the recorded stages;
// nothing new is computed and nothing leaves the browser.
import type { Api, OrganKey } from "./types";

export type Stage = "loaded" | "chennai" | "broken" | "repaired";
const ORDER: Stage[] = ["loaded", "chennai", "broken", "repaired"];
const KEY = "kindred.offline.stage";
const DECLINE_KEY = "kindred.offline.declined";
// Highest backend event sequence number that belongs to each stage of the recorded story.
const EVENT_CUTOFF: Record<Stage, number> = { loaded: 6, chennai: 7, broken: 10, repaired: 11 };

type Snapshot = Record<string, any>;
let snap: Snapshot | null = null;
async function load(): Promise<Snapshot> {
  if (!snap) snap = (await import("@/lib/demo/snapshot.json")).default as Snapshot;
  return snap;
}

function readStage(): Stage {
  try {
    const s = localStorage.getItem(KEY) as Stage | null;
    if (s && ORDER.includes(s)) return s;
  } catch { /* storage blocked */ }
  return "chennai";
}
function writeStage(s: Stage) {
  try { localStorage.setItem(KEY, s); if (s !== "broken") localStorage.removeItem(DECLINE_KEY); } catch { /* storage blocked */ }
}
function readDecline(): { reason: string; at: number } | null {
  try { const v = localStorage.getItem(DECLINE_KEY); return v ? JSON.parse(v) : null; } catch { return null; }
}
const atLeast = (s: Stage) => ORDER.indexOf(readStage()) >= ORDER.indexOf(s);
// The liver story is recorded separately (its donor work-ups), so it moves on its own: before -> broken.
const LIVER_KEY = "kindred.offline.liver";
function liverBroken(): boolean {
  try { return localStorage.getItem(LIVER_KEY) === "broken"; } catch { return false; }
}
const byOrgan = <T extends { organ?: string | null }>(rows: T[], organ?: OrganKey | null) => (organ ? rows.filter((r) => r.organ === organ) : rows);

class NotFound extends Error {
  status = 404;
}

export function createOfflineApi(): Api {
  return {
    async pool() {
      const s = await load();
      const p = ({ loaded: s.pool_loaded, chennai: s.pool_chennai, broken: s.pool_broken, repaired: s.pool_repaired } as const)[readStage()];
      return readStage() === "broken" && readDecline() ? { ...p, open_tasks: [], escalations: [] } : { escalations: [], ...p };
    },
    async loop(id) {
      const s = await load();
      const stage = readStage();
      if (s.liver_focus_loop && id === s.liver_focus_loop && liverBroken()) return s.liver_loop_broken;
      if (id === s.focus_loop) {
        if (stage === "broken") {
          const d = readDecline();
          return d ? { ...s.loop_broken, proposal: { ...s.loop_broken.proposal, status: "declined", result: d.reason, done_at: d.at, declined_by: "Exchange coordinator (person)" } } : s.loop_broken;
        }
        if (stage === "repaired") return s.loop_old_after;
        return s.loops_before[id];
      }
      if (s.loop_repaired && id === s.loop_repaired.loop.loop_id) {
        if (stage !== "repaired") throw new NotFound(`${id} does not exist yet at this point in the recorded story`);
        return s.loop_repaired;
      }
      const l = s.loops_before[id];
      if (!l) throw new NotFound(`No loop ${id} in the offline snapshot`);
      return l;
    },
    async committee() {
      const s = await load();
      return atLeast("repaired") ? s.committee : s.committee_before;
    },
    async family(pairId, lang) {
      const s = await load();
      const f = s.family[`${pairId}|${lang}`] ?? s.family[`${pairId}|en`];
      if (!f) throw new NotFound(`The offline snapshot has a family view for ${Object.keys(s.family).map((k) => k.split("|")[0]).filter((v, i, a) => a.indexOf(v) === i).join(", ")} only`);
      return f;
    },
    async events(since = 0) {
      const s = await load();
      const cut = (s.event_cutoff ?? EVENT_CUTOFF)[readStage()];
      return (s.events as any[]).filter((e) => e.seq > since && e.seq <= cut);
    },
    async queries() { return (await load()).queries; },
    async sim() { return (await load()).sim; },
    async graphOverview() {
      const g = (await load()).graph_overview;
      if (!g) throw new NotFound("The offline snapshot has no graph overview; rerun scripts/capture-snapshot.py");
      return g;
    },
    async hospital(code) {
      const h = (await load()).hospital[code.toUpperCase()];
      if (!h) throw new NotFound(`No hospital ${code}`);
      return h;
    },
    async reset() { writeStage("loaded"); try { localStorage.removeItem(LIVER_KEY); } catch { /* storage blocked */ } return { ok: true, offline: true }; },
    async addChennai() { if (!atLeast("chennai")) writeStage("chennai"); return { ok: true, offline: true }; },
    async runPlan() { return { ok: true, offline: true, note: "The offline snapshot keeps the recorded plan." }; },
    async runLab(id) {
      const s = await load();
      if (s.liver_focus_loop && id === s.liver_focus_loop) {
        try { localStorage.setItem(LIVER_KEY, "broken"); } catch { /* storage blocked */ }
        return s.liver_lab_result;
      }
      if (id === s.focus_loop && !atLeast("broken")) writeStage("broken");
      return id === s.focus_loop ? s.lab_result : { results: [], offline: true, note: "Only the recorded loop has lab results offline." };
    },
    async chase() { return { ok: true, offline: true, step: null }; },
    async decline(taskId, reason) {
      const s = await load();
      if (s.pool_broken.open_tasks?.[0]?.task_id !== taskId) throw new Error("This repair task is not part of the recorded story.");
      try { localStorage.setItem(DECLINE_KEY, JSON.stringify({ reason, at: Date.now() })); } catch { /* storage blocked */ }
      return { declined: s.focus_loop, rematched: [] };
    },
    async agents() { return { enabled: false, interval_s: 0, sweeps: 0, last_at: null, last_actions: [], running: false, offline: true }; },
    async sweep() { return { enabled: false, interval_s: 0, sweeps: 0, last_at: null, last_actions: [], running: false, offline: true, skipped: true }; },
    async me() { return (await load()).me; },
    async programs() { return (await load()).programs ?? []; },
    async pairs(organ) {
      const s = await load();
      const p = s.pairs ?? { organ: null, pairs: [], privacy: "" };
      return { ...p, organ: organ ?? null, pairs: byOrgan(p.pairs, organ) };
    },
    async integrity(organ) {
      const s = await load();
      const i = (atLeast("repaired") ? s.integrity_after : s.integrity_before) ?? { findings: [], counts: {}, checks: {}, note: "" };
      const findings = byOrgan(i.findings as any[], organ);
      return { ...i, organ: organ ?? null, findings, counts: { error: findings.filter((f: any) => f.severity === "error").length, warn: findings.filter((f: any) => f.severity === "warn").length, info: findings.filter((f: any) => f.severity === "info").length } };
    },
    async simulations() { return (await load()).simulations ?? []; },
    // Ask KindRed needs the model, so offline mode can only replay answers recorded from the live agent.
    async askStatus() {
      const rec = ((await load()).ask ?? []) as { question: string }[];
      return { enabled: rec.length > 0, offline: true, recorded: rec.map((r) => r.question) } as any;
    },
    async askHistory() { return { questions: [] }; },
    async ask(question) {
      const rec = ((await load()).ask ?? []) as { question: string; result: any }[];
      const hit = rec.find((r) => r.question.trim().toLowerCase() === question.trim().toLowerCase());
      if (!hit) throw new Error("Offline mode only has answers recorded for the example questions. Connect the API to ask anything else.");
      return hit.result;
    },
    async audit(organ) {
      const s = await load();
      const cut = (s.event_cutoff ?? EVENT_CUTOFF)[readStage()];
      const rows = ((s.audit ?? s.events) as any[]).filter((e) => e.seq <= cut);
      return organ ? rows.filter((e) => e.organ === organ || e.organ === "shared") : rows;
    },
    async approve(taskId, choice) {
      const s = await load();
      const task = s.pool_broken.open_tasks?.[0];
      if (!task || task.task_id !== taskId) throw new Error("This repair task is not part of the recorded story.");
      if (choice !== "recommended") throw new Error("Offline mode only has the recorded outcome for the recommended repair. Connect the API to try the fallback or alternatives.");
      writeStage("repaired");
      return s.approve_result;
    },
  };
}

export async function offlineCapturedAt(): Promise<number> {
  return (await load()).captured_at;
}
export { readStage as offlineStage };
