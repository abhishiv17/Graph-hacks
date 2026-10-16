// Load test for the KindRed API with Artillery (Track 2: high-concurrency reads and writes), then a check that no
// write was lost or doubled. Everything runs in a private copy of the demo, so the shared demo is never touched.
//
//   cd loadtest && npm install && npm test          # about 2 minutes; writes data/generated/loadtest.json
//   npm run quick                                   # a 20-second smoke run, nothing written
//   node run.mjs --target https://your-api.example  # against a deployed backend
//
// Steps: make a private copy, run kindred.yml (visitors reading and writing at once), count every chat message and
// page visit in the copy's graphs and compare with what Artillery says was written, run contention.yml (20 people
// pressing Next week on one patient at once: exactly one may win), then delete the copy.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const TARGET = flag("--target", process.env.KINDRED_API || "http://localhost:8000").replace(/\/$/, "");
const QUICK = args.includes("--quick");
const PERSONA = "rajesh";
const OUT = path.join(here, "out");
mkdirSync(OUT, { recursive: true });

let WORLD = "";
async function api(method, url, body) {
  const r = await fetch(TARGET + url, {
    method, headers: { "content-type": "application/json", ...(WORLD ? { "X-KindRed-World": WORLD } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${url}: ${r.status} ${await r.text()}`);
  return r.json();
}

function artillery(config, out, env) {
  return new Promise((resolve, reject) => {
    const p = spawn("npx", ["artillery", "run", config, "--target", TARGET, "--output", out],
                    { cwd: here, shell: true, stdio: "inherit", env: { ...process.env, ...env } });
    p.on("exit", (code) => (code === 0 || code === 1 ? resolve(code) : reject(new Error(`artillery exited ${code}`))));
  });
}

const counter = (rep, key) => rep.aggregate.counters[key] ?? 0;
const byName = (rep, name, code) => counter(rep, `plugins.metrics-by-endpoint.${name}.codes.${code}`);
/** Requests to one endpoint that got no answer in time (the client gave up; the server may still have finished). */
const timedOut = (rep, name) => counter(rep, `plugins.metrics-by-endpoint.${name}.errors.ERR_SOCKET_TIMEOUT`);
const ms = (s) => s && { p50: s.median ?? s.p50, p95: s.p95, p99: s.p99, max: s.max, count: s.count };

function quickConfig() {
  const yml = readFileSync(path.join(here, "kindred.yml"), "utf8")
    .replace(/  phases:[\s\S]*?(?=  plugins:)/, "  phases:\n    - { name: smoke, duration: 20, arrivalRate: 3 }\n");
  const p = path.join(OUT, "quick.yml");
  writeFileSync(p, yml.replace('"./processor.cjs"', JSON.stringify(path.join(here, "processor.cjs"))));
  return p;
}

async function main() {
  console.log(`KindRed load test against ${TARGET}`);
  const t0 = Date.now();
  const world = await api("POST", "/api/worlds");
  WORLD = world.id;
  console.log(`private copy ${WORLD} ready in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  try {
    const { pairs } = await api("GET", "/api/pairs");
    const demo = new Set((await api("GET", "/api/personas")).map((p) => p.pair_id));
    // Waiting families aren't in a swap, so a question naming another family is always outside the chat's scope.
    // (The demo patients' own families are left out: their chats are filed under the patient, chat_sunita.)
    const fams = pairs.filter((p) => p.status === "waiting" && !demo.has(p.pair_id)).slice(0, 8).map((p) => p.pair_id);
    const env = { WORLD, PAIRS: fams.join(",") };
    const before = (await api("GET", "/api/worlds/current/stats")).graphs;

    const mainOut = path.join(OUT, "main.json");
    await artillery(QUICK ? quickConfig() : "kindred.yml", mainOut, env);
    const rep = JSON.parse(readFileSync(mainOut, "utf8"));

    // Every write Artillery saw succeed must be in the graph exactly once.
    const after = (await api("GET", "/api/worlds/current/stats")).graphs;
    const chats = fams.map((p) => `chat_${p.toLowerCase()}`);
    const opened = chats.filter((g) => (after[g]?.messages ?? 0) > 0).length;
    const msgs = chats.reduce((n, g) => n + (after[g]?.messages ?? 0) - (before[g]?.messages ?? 0), 0);
    const turns = byName(rep, "write: chat turn", 200);
    // A chat turn the client gave up on is still written once by the server (it doesn't know the client left), so
    // those count too; a lost write would show as fewer messages, a doubled one as more.
    const turnsLate = timedOut(rep, "write: chat turn");
    const visits = byName(rep, "write: patient visit", 200);
    // A reload within a minute with nothing new is the same visit (no new Session), so count the visits the API
    // reported as new.
    const newVisits = counter(rep, "kindred.new_visits");
    const sessions = (after.mem_sunita?.sessions ?? 0) - (before.mem_sunita?.sessions ?? 0);
    const checks = [
      { check: "chat messages in the graph = 6 starters per opened chat + 2 per chat turn sent (answered, or answered after the client gave up)",
        expected: 6 * opened + 2 * (turns + turnsLate), found: msgs },
      { check: "patient visits in the graph = visits the API reported as new", expected: newVisits, found: sessions },
    ];

    // Contention: 20 people press Next week on the same patient, all looking at the same week.
    const week = (await api("GET", `/api/personas/${PERSONA}`)).week;
    const contOut = path.join(OUT, "contention.json");
    await artillery("contention.yml", contOut, { ...env, PERSONA, WEEK: String(week) });
    const cont = JSON.parse(readFileSync(contOut, "utf8"));
    const moved = (await api("GET", `/api/personas/${PERSONA}`)).week;
    const won = byName(cont, "write: next week", 200), refused = byName(cont, "write: next week", 409);
    checks.push({ check: "Next week pressed 20 times at once: exactly one moves the journey", expected: 1, found: won },
                { check: "the journey moved exactly one week", expected: week + 1, found: moved },
                { check: "everyone else was refused (409)", expected: 20 - won, found: refused });

    const s = rep.aggregate.summaries, c = rep.aggregate.counters;
    const endpoints = Object.keys(s).filter((k) => k.startsWith("plugins.metrics-by-endpoint.response_time."))
      .map((k) => { const name = k.slice("plugins.metrics-by-endpoint.response_time.".length);
                    const bad = (x) => (x.startsWith(`plugins.metrics-by-endpoint.${name}.codes.`) && !x.endsWith(".200")) ||
                                       x.startsWith(`plugins.metrics-by-endpoint.${name}.errors.`);
                    return { name, ...ms(s[k]), errors: Object.keys(c).filter(bad).reduce((n, x) => n + c[x], 0) }; })
      .sort((a, b) => a.name.localeCompare(b.name));
    const secs = (rep.aggregate.lastMetricAt - rep.aggregate.firstMetricAt) / 1000;
    const result = {
      tool: "Artillery 2.0.34", target: TARGET.includes("localhost") ? "local (docker compose)" : TARGET, quick: QUICK,
      ran_at: new Date().toISOString(),
      machine: { os: `${os.type()} ${os.release()}`, cpus: os.cpus().length },
      phases: QUICK ? "20 s at 3 new visitors/s" : "15 s warm-up at 2/s, 30 s ramp 4 → 20/s, 60 s at 20 new visitors/s",
      visitors: c["vusers.created"], completed: c["vusers.completed"], failed: c["vusers.failed"] ?? 0,
      requests: c["http.requests"], ok: c["http.codes.200"] ?? 0,
      errors: Object.entries(c).filter(([k]) => (k.startsWith("http.codes.") && k !== "http.codes.200") || /^errors\./.test(k))
        .reduce((o, [k, v]) => ({ ...o, [k.replace(/^(http\.codes|errors)\./, "")]: v }), {}),
      seconds: Math.round(secs), rps: Math.round((c["http.requests"] / Math.max(1, secs)) * 10) / 10,
      latency_ms: ms(s["http.response_time"]), endpoints,
      writes: { chat_turns: turns, chat_turns_after_timeout: turnsLate, chat_messages: msgs, patient_visits: visits, new_visits: newVisits, families: fams.length },
      contention: { pressed: 20, moved: won, refused, week_before: week, week_after: moved,
                    latency_ms: ms(cont.aggregate.summaries["http.response_time"]) },
      checks: checks.map((x) => ({ ...x, ok: x.expected === x.found })),
    };
    result.passed = result.checks.every((x) => x.ok) && result.failed === 0;

    console.log("\n" + result.checks.map((x) => `${x.ok ? "PASS" : "FAIL"}  ${x.check}: expected ${x.expected}, found ${x.found}`).join("\n"));
    console.log(`\n${result.requests} requests in ${result.seconds} s (${result.rps}/s), p95 ${result.latency_ms?.p95} ms, ` +
                `p99 ${result.latency_ms?.p99} ms, errors ${JSON.stringify(result.errors)}`);
    if (!QUICK) {
      const file = path.join(here, "..", "data", "generated", "loadtest.json");
      writeFileSync(file, JSON.stringify(result, null, 2) + "\n");
      console.log(`written to ${path.relative(process.cwd(), file)}`);
    }
    process.exitCode = result.passed ? 0 : 1;
  } finally {
    await api("DELETE", "/api/worlds/current").catch(() => {});
    console.log(`private copy ${WORLD} deleted`);
  }
}

main().catch((e) => { console.error(e); process.exit(2); });
