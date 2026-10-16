export type Ran = { query: string; graph: string; ms: number };

export type LoopPair = { pair_id: string; code: string; city: string; lat: number; lon: number };
export type LoopSummary = {
  loop_id: string; organ?: string; kind: string; status: string; p_success: number; expected_tx: number;
  has_fallback: boolean; created_at: number; replaced_by: string | null; pairs: LoopPair[];
};
export type Hospital = { code: string; city: string; lat: number; lon: number; pairs: number; liver_pairs?: number };
/** One donation inside a planned loop: the donor of `from_pair` gives to the patient of `to_pair`. */
export type PoolLink = {
  loop_id: string; organ?: string; pos: number; from_pair: string; to_pair: string;
  donor_abo: string; donor_relation: string; patient_abo: string; patient_cpra: number;
  patient_meld?: number | null; patient_weight_kg?: number | null; lobe?: string | null; grwr?: number | null;
  p_success: number | null; status: string; reasons: string[] | null; failed_cause: string | null; failed_detail: string | null;
};
export type DemoStory = {
  chennai_added: boolean; hero_loop: string | null; hero_status: string | null; repaired_into: string | null;
  family_pair: string; new_family_pair: string;
};
export type GraphOverview = {
  graphs: { name: string; nodes: { label: string; n: number }[]; relationships: { type: string; n: number }[]; node_total: number; rel_total: number }[];
  queries: { name: string; about: string; runs: number; p50_ms: number | null; p95_ms: number | null }[];
  recent: { query: string; graph: string; ms: number; at: number; rows: number }[];
  tools: { name: string; about: string }[];
};
export type Pool = {
  tiles: Record<string, number>; by_organ?: Record<string, { loops: number; expected_tx: number; planned_tx: number }>; hospitals: Hospital[]; plan: Record<string, any> | null;
  loops: LoopSummary[]; links?: PoolLink[]; demo?: DemoStory; bridges?: { pair_id: string; score: number }[]; open_tasks: { task_id: string; kind: string; loop_id: string; at: number }[]; queries: Ran[];
  escalations?: { task_id: string; loop_id: string; at: number; pair_id: string; city: string; missing: string[]; days_left: number }[];
};
export type OrganKey = "kidney" | "liver";
export type EvalStatus = "ELIGIBLE" | "REVIEW_REQUIRED" | "UNKNOWN" | "INELIGIBLE";
export type ProgramRule = { code: string; text: string; source: string };
export type ReviewItem = { key: string; label: string; kind: string; documents?: string[]; node?: string; field?: string };
export type Program = {
  organ: OrganKey; label: string; title: string; exchange_label: string; loop_prefix: string; test_name: string;
  hospitals: string[]; rules: ProgramRule[]; committee_review: ReviewItem[]; timeline: { key: string; label: string; days: number }[];
  scenario: Scenario; story: { pairs: string[]; family_pair: string }; statuses: EvalStatus[]; note: string;
  pairs?: number; waiting?: number; loops?: number; expected_tx?: number;
};
export type Scenario = {
  id: string; title: string; initial_state: string; failure_event: string; repair_strategy: string; expected_review_step: string;
  organ?: OrganKey; story_pairs?: string[]; family_pair?: string; story_loop?: string | null; story_status?: string | null;
  repaired_into?: string | null; synthetic?: boolean;
};
/** Shared exchange facts for one pair (GET /api/pairs). Kidney rows carry crossmatch and HLA facts, liver rows the
 *  evaluation statuses. No names, documents or notes: those stay in the hospital's private graph. */
export type PairFacts = {
  pair_id: string; organ: OrganKey; code: string; city: string; status: string; approval_state: string; failed_count: number;
  donor_abo: string; donor_relation: string; patient_abo: string; loop_id: string | null; gives_to: number; receives_from: number;
  cpra?: number | null; untyped_loci?: string[] | null; crossmatch?: string; hla_typing?: string;
  meld?: number | null; patient_weight_kg?: number | null; volumetry?: string | null; graft_suitability?: EvalStatus;
  anatomy_review?: EvalStatus; donor_evaluation?: EvalStatus; recipient_evaluation?: EvalStatus; surgical_review?: EvalStatus;
};
export type Approval = { status: "PENDING" | "APPROVED" | "DECLINED" | "NOT_APPLICABLE"; step: string; note?: string; by?: string | null; task_id?: string };
export type EvidenceLink = {
  recommendation_id: string; organ: OrganKey; candidate_edge: string; from_pair: string; to_pair: string; facts: string[];
  constraints_satisfied: string[]; flags: string[]; p_success: number | null; edge_status: string;
  test: { kind: string; name: string; id: string | null; result: string; finding: string | null };
  failure: { cause: string; detail: string } | null; human_approval: Approval;
};
export type Evidence = {
  loop_id: string; organ: OrganKey; exchange_label: string; organ_isolated: boolean; links: EvidenceLink[]; rules: ProgramRule[];
  proposal: { recommendation_id: string; pairs: string[]; route: string; facts: string[]; expected: number; human_approval: Approval } | null;
  source: string;
};
export type Checklist = { organ: OrganKey; items: { key: string; label: string; kind: string; done: boolean; open: string[] }[]; done: number; total: number; readiness_pct: number };
export type Timeline = { organ: OrganKey; synthetic: boolean; note: string; steps: { key: string; label: string; proposed_date: number; days: number; state: "done" | "current" | "upcoming" | "paused" }[] };
export type IntegrityFinding = { check: string; severity: "error" | "warn" | "info"; ref: string; organ: OrganKey | null; detail: string; scope: string };
export type Integrity = { organ: OrganKey | null; findings: IntegrityFinding[]; counts: Record<string, number>; checks: Record<string, string>; note: string; queries?: Ran[] };
export type Viewer = { id: string; name: string; role: string; role_label: string; programs: OrganKey[]; authenticated: boolean; note: string; permissions: Record<string, boolean> };

/** The agents as a graph (GET /api/agents/graph): read from FalkorDB's Agent, Decision, Task and Event nodes. */
export type AgentNode = {
  id: string; type: "agent" | "graph" | "task"; label: string; does: string;
  driver?: "model" | "rules" | "person"; decisions?: number; events?: number; open_tasks?: number; members?: string[];
  last?: { text: string; at: number } | null; active?: boolean; graph?: string;
  from?: string; to?: string; n?: number; about?: string[]; at?: number;
};
export type AgentEdge = { from: string; to: string; kind: "writes" | "reads" | "hands"; n: number; what: string[] };
export type AgentFeedItem = { at: number; agent: string; node: string | null; text: string; kind: string; via?: string; why?: string };
export type AgentGraph = {
  nodes: AgentNode[]; edges: AgentEdge[]; feed: AgentFeedItem[]; now: number;
  watch: { enabled: boolean; interval_s: number; sweeps: number; last_at: number | null; running: boolean; paused: boolean; last_actions: string[] };
};
export type AgentState = { enabled: boolean; interval_s: number; sweeps: number; last_at: number | null; last_actions: string[]; running: boolean; offline?: boolean };
export type BackendEvent = { seq: number; at: number; agent: string; text: string; kind: string; organ?: OrganKey | "shared" };

/** The same surface as the FastAPI backend, so pages work against either the live API or the offline snapshot. */
/** Ask KindRed: one answered question, with the tool calls and graph paths behind it. */
export type AskTrace = { tool: string; input: Record<string, unknown>; rows: number; ms: number; ids: string[]; error?: string; queries: (Ran & { read_only?: boolean })[] };
export type AskResult = {
  answer: string; draft_replaced: boolean; unverified_ids: string[]; verified_ids: string[];
  trace: AskTrace[]; paths: string[][]; nodes: Record<string, { city: string; organ: string; status: string }>;
  model: string; provider?: string; stop_reason: string | null; ms: number; remembered_as?: string | null; from_memory?: MemoryItem[]; example?: boolean;
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number };
};
export type AskMemory = { question_id: string; question: string; answer: string; at: number; asked_by: string; about: string[] };
export type AskStatus = { enabled: boolean; provider?: "anthropic" | "ollama"; model?: string; how?: string; tools?: string[]; offline?: boolean };

/** Demo patients (GET /api/personas): followed by the health watch over simulated weeks. */
export type PersonaReading = { result_id: string; value: number; unit: string; at: number; week: number; assessed: boolean };
export type PersonaSummary = {
  id: string; name: string; age: number; organ: OrganKey; pair_id: string; hospital: string; city: string; story: string;
  measure: { key: string; label: string; unit: string; better: "higher" | "lower" }; stage: string | null; stage_label: string;
  last: PersonaReading | null; trend: string | null; week: number; now: number; weeks_left: number;
  case: PersonaCase | null; pair_status: string | null; transplanted: boolean;
};
/** One tool call of the coordinator agent: what it called, with what, and what the graph answered. */
type Latency = { n: number; p50_ms: number | null; p95_ms: number | null; max_ms: number | null };
/** One family as a small graph (GET /api/families/{id}/explore): its parts and the families around it, hop by hop. */
export type ExploreNodeType = "family" | "patient" | "donor" | "hospital" | "blood" | "antigen" | "antibody" | "liver";
export type ExploreNode = { id: string; type: ExploreNodeType; label: string; sub: string; hop: number; data: Record<string, any>; why?: string };
export type ExploreEdge = {
  id: string; from: string; to: string; type: string; label: string; mark: "own" | "loop2" | "loop3" | null;
  p?: number; reasons?: string[]; mfi?: number; loops?: number[]; why?: string;
};
export type Explore = {
  center: string; organ: string; hops: number; nodes: ExploreNode[]; edges: ExploreEdge[];
  why_not_own: { text: string; edges: string[] };
  loops: { pairs: string[]; probs: number[]; p_all: number; size: number }[];
  counts: { gives_to: number; receives_from: number; two_way: number; three_way: number; families_shown: number };
  queries: Ran[];
};
/** The measured load test through the API (loadtest/run.mjs with Artillery, data/generated/loadtest.json). */
export type LatencyMs = { p50: number; p95: number; p99: number; max: number; count: number };
export type LoadTest = {
  ready: boolean; tool: string; target: string; ran_at: string; machine: { os: string; cpus: number }; phases: string;
  visitors: number; completed: number; failed: number; requests: number; ok: number; errors: Record<string, number>;
  seconds: number; rps: number; latency_ms: LatencyMs; endpoints: (LatencyMs & { name: string; errors: number })[];
  writes: { chat_turns: number; chat_turns_after_timeout?: number; chat_messages: number; patient_visits: number; new_visits: number; families: number };
  contention: { pressed: number; moved: number; refused: number; week_before: number; week_after: number; latency_ms: LatencyMs };
  checks: { check: string; expected: number; found: number; ok: boolean }[]; passed: boolean;
};
/** The measured concurrency test (backend swapnet/sim/concurrency.py, data/generated/concurrency.json). */
export type Concurrency = {
  ready: boolean; falkordb: { version: string; settings: Record<string, string | number> };
  machine: { cpus: number; os: string; python: string }; base_pool: number; new_families: number; measured_at: number; note: string;
  throughput: {
    writers: number; readers: number; families: number; published: number; seconds: number; families_per_s: number;
    write_queries_per_s: number; publish_latency: Latency; links_built: number; searches_during_load: number;
    pool_before: number; pool_after: number; errors: { write: number; read: number; examples: string[] };
    lost_writes: number; all_at_version_1: boolean;
  }[];
  reads_under_writes: {
    writers: number; readers: number; seconds: number; pool: number; loops_in_pool: number; updates: number; updates_per_s: number;
    update_latency: Latency; search_idle: Latency; search_during_writes: Latency; search_idle_after: Latency;
    slowdown_p50: number | null; errors: { write: number; read: number; examples: string[] };
  }[];
  contention: {
    agents: number; updates_each: number; updates_wanted: number; seconds: number; updates_applied: number; conflicts_caught: number;
    gave_up: number; errors: number; lost_updates: number; version_check_ok: boolean; update_latency: Latency;
    control_without_check: { updates_wanted: number; updates_kept: number; lost_updates: number };
  }[];
};
/** One memory an agent read before acting (backend agents/recall.py): what, who wrote it, and what it did with it. */
export type MemoryRead = {
  memory: string; kind: "episodic" | "semantic" | "procedural" | "shared"; written_by: string; n: number; used: string; detail: string[];
};
export type CoordinatorStep = { tool: string; input: Record<string, unknown>; result: any; error: string | null; by: "model" | "rules"; ms: number; via?: "mcp" };
/** One swap search for a demo patient, at one depth (2 = 2-way only, 3 = also 3-way). */
export type PersonaSearch = {
  search_id: string; at: number; week: number; depth: 2 | 3; found: number; total: number; by: string;
  loops: { families: string[]; size: number; route: string; p_all: number }[];
};
/** One donation of the patient's swap, read from its edge (Q13). */
export type SwapLink = {
  pos: number; from_pair: string; to_pair: string; from_city: string; to_city: string; organ: string;
  donor_abo: string; donor_relation: string; patient_abo: string; reasons: string[] | null; p_success: number | null;
  lobe?: string | null; grwr?: number | null; remnant_pct?: number | null; failed_cause?: string | null;
};
/** One piece of an answer that came from memory: what, when it was learned, and which agent learned it. */
export type MemoryItem = { what: string; at: number; by: string };
export type ChatMessage = { message_id: string; role: "user" | "assistant"; text: string; at: number; tools: string[]; model: string | null; memory?: MemoryItem[] };
/** The live swap a demo patient is in, and where it stands. */
export type PersonaCase = {
  loop_id: string; status: string; kind: string; route: string; pairs: string[]; cities: string[];
  surgery_at: number | null; transplanted_at: number | null; p_success: number | null;
};
export type PersonaHandoff = {
  task_id: string; kind: string; status: "open" | "done" | "declined" | "superseded"; agent: string; action: string;
  payload: { agent?: string; action?: string; what?: string | null; why?: string; stage?: string; step?: number };
  result: string | null; at: number; done_at: number | null; finding_id: string; read?: string | null;
};
export type PersonaFinding = {
  finding_id: string; at: number; week: number; stage: string; previous_stage: string | null; text: string; value: number;
  slope_per_year: number; weeks_to_next: number | null; kind: "baseline" | "reading" | "stage_change" | "case" | "world" | "decision" | "check";
  trace?: CoordinatorStep[] | null; model?: string | null; safety_net?: string | null; action?: string | null; due?: string | null;
  read?: MemoryRead[] | null;
  readings: { result_id: string; value: number; at: number }[];
  handoffs: { task_id: string; agent: string; action: string; status: string; detail: string | null }[];
};
export type PersonaJourney = PersonaSummary & {
  readings: PersonaReading[];
  facts: { key: string; value: string; text: string; at: number; was: string | null; was_text: string | null; was_at: number | null }[];
  findings: PersonaFinding[];
  playbook: { stage: string; step: number; agent: string; action: string; what: string | null; in_days: number | null; why: string }[];
  sessions: { session_id: string; at: number; week: number; greeting: string }[];
  handoffs: PersonaHandoff[];
  appointments: { appointment_id: string; kind: string; status: string; at: number; note: string | null; booked_by: string; task_id: string | null }[];
  pair: { status: string; urgent: boolean; needs_rematch: boolean; approval_state: string; loop_id: string | null } | null;
  family_message: string | null; thresholds: { value: number; label: string }[];
  stages: { key: string; label: string; rule: string }[]; sources: string[];
  graphs: { memory: string; hospital: string; shared: string }; queries: Ran[];
  why: SwapLink[]; searches: PersonaSearch[]; conversation: ChatMessage[];
  places: Record<string, { code: string; city: string; lat: number; lon: number }>;
};

export interface Api {
  pool(): Promise<Pool>;
  loop(id: string): Promise<any>;
  committee(): Promise<any>;
  family(pairId: string, lang: string): Promise<any>;
  events(since?: number): Promise<BackendEvent[]>;
  queries(): Promise<Record<string, string>>;
  sim(): Promise<any>;
  concurrency(): Promise<Concurrency>;
  loadtest(): Promise<LoadTest>;
  explore(pair: string, hops: number): Promise<Explore>;
  graphOverview(): Promise<GraphOverview>;
  hospital(code: string): Promise<any>;
  reset(): Promise<any>;
  addChennai(): Promise<any>;
  runPlan(): Promise<any>;
  runLab(loopId: string): Promise<any>;
  chase(loopId: string): Promise<any>;
  approve(taskId: string, choice: string): Promise<any>;
  decline(taskId: string, reason: string): Promise<any>;
  agents(): Promise<AgentState>;
  agentsGraph(): Promise<AgentGraph>;
  sweep(): Promise<AgentState & { skipped: boolean }>;
  // Multi-organ platform
  me(): Promise<Viewer>;
  programs(): Promise<Program[]>;
  pairs(organ?: OrganKey | null): Promise<{ organ: OrganKey | null; pairs: PairFacts[]; privacy: string; queries?: Ran[] }>;
  integrity(organ?: OrganKey | null): Promise<Integrity>;
  simulations(): Promise<Scenario[]>;
  audit(organ?: OrganKey | null): Promise<BackendEvent[]>;
  // Ask KindRed (live API only)
  askStatus(): Promise<AskStatus>;
  askHistory(): Promise<{ questions: AskMemory[] }>;
  askExamples(): Promise<{ examples: { q: string; r: AskResult }[] }>;
  ask(question: string, history: { role: "user" | "assistant"; content: string }[]): Promise<AskResult>;
  // Demo patients (live API only)
  personas(): Promise<PersonaSummary[]>;
  persona(id: string): Promise<PersonaJourney>;
  personaSession(id: string): Promise<{ greeting: string; session_id: string; reused: boolean }>;
  personaAdvance(id: string, week?: number): Promise<any>;
  worldCurrent(): Promise<{ shared: boolean; id: string | null; expires_in_s?: number }>;
  worldCreate(): Promise<{ id: string; expires_in_s: number }>;
  worldLeave(): Promise<{ deleted: string }>;
  personaReset(id: string): Promise<any>;
  personaChat(id: string, message: string): Promise<{ messages: ChatMessage[]; answer: string }>;
  chatHistory(kind: "persona" | "family", id: string): Promise<{ messages: ChatMessage[]; about: string }>;
  chatAsk(kind: "persona" | "family", id: string, message: string): Promise<{ messages: ChatMessage[]; answer: string; about: string }>;
}
