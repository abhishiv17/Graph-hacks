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

export type AgentState = { enabled: boolean; interval_s: number; sweeps: number; last_at: number | null; last_actions: string[]; running: boolean; offline?: boolean };
export type BackendEvent = { seq: number; at: number; agent: string; text: string; kind: string; organ?: OrganKey | "shared" };

/** The same surface as the FastAPI backend, so pages work against either the live API or the offline snapshot. */
export interface Api {
  pool(): Promise<Pool>;
  loop(id: string): Promise<any>;
  committee(): Promise<any>;
  family(pairId: string, lang: string): Promise<any>;
  events(since?: number): Promise<BackendEvent[]>;
  queries(): Promise<Record<string, string>>;
  sim(): Promise<any>;
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
  sweep(): Promise<AgentState & { skipped: boolean }>;
  // Multi-organ platform
  me(): Promise<Viewer>;
  programs(): Promise<Program[]>;
  pairs(organ?: OrganKey | null): Promise<{ organ: OrganKey | null; pairs: PairFacts[]; privacy: string; queries?: Ran[] }>;
  integrity(organ?: OrganKey | null): Promise<Integrity>;
  simulations(): Promise<Scenario[]>;
  audit(organ?: OrganKey | null): Promise<BackendEvent[]>;
}
