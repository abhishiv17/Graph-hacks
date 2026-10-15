export type Ran = { query: string; graph: string; ms: number };

export type LoopPair = { pair_id: string; code: string; city: string; lat: number; lon: number };
export type LoopSummary = {
  loop_id: string; kind: string; status: string; p_success: number; expected_tx: number;
  has_fallback: boolean; created_at: number; replaced_by: string | null; pairs: LoopPair[];
};
export type Hospital = { code: string; city: string; lat: number; lon: number; pairs: number };
/** One donation inside a planned loop: the donor of `from_pair` gives to the patient of `to_pair`. */
export type PoolLink = {
  loop_id: string; pos: number; from_pair: string; to_pair: string;
  donor_abo: string; donor_relation: string; patient_abo: string; patient_cpra: number;
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
  tiles: Record<string, number>; hospitals: Hospital[]; plan: Record<string, any> | null;
  loops: LoopSummary[]; links?: PoolLink[]; demo?: DemoStory; bridges?: { pair_id: string; score: number }[]; open_tasks: { task_id: string; kind: string; loop_id: string; at: number }[]; queries: Ran[];
  escalations?: { task_id: string; loop_id: string; at: number; pair_id: string; city: string; missing: string[]; days_left: number }[];
};
export type AgentState = { enabled: boolean; interval_s: number; sweeps: number; last_at: number | null; last_actions: string[]; running: boolean; offline?: boolean };
export type BackendEvent = { seq: number; at: number; agent: string; text: string; kind: string };

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
}
