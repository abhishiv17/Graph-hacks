// Plain words for the graph's vocabulary, so every screen reads the same way. The graph keeps the exact reasons
// (shown in full where a reviewer needs them); people see a short sentence first.

type SwapLike = { loop_id: string; organ?: string | null; kind?: string; pairs?: { city: string }[] };

/** "Hyderabad–Bengaluru–Kolkata kidney swap": what a person would call it. The id (S-0076) stays as a small label. */
export function swapName(l: SwapLike, cities?: string[]) {
  const cs = [...new Set(cities ?? (l.pairs ?? []).map((p) => p.city))];  // two families in one city: name it once
  const organ = l.organ ?? (l.loop_id.startsWith("L-") ? "liver" : "kidney");
  const backup = l.loop_id.endsWith("-FB") ? " (backup)" : "";
  return `${cs.length ? cs.join("–") : l.loop_id} ${organ} swap${backup}`;
}

/** "3 families" for a 3-way swap. */
export const families = (kind?: string, n?: number) => `${n ?? Number((kind ?? "").split("-")[0] || 0)} families`;

const CHECK: Record<string, string> = {
  ORGAN_TYPE: "Same organ program",
  BLOOD_COMPATIBILITY: "Blood groups fit",
  NO_REMEMBERED_FAILURE: "Never failed before",
  VIRTUAL_CROSSMATCH_CLEAR: "No antibody clash on paper",
  LAB_CROSSMATCH: "Lab test passed",
  GRAFT_SIZE: "Liver piece is big enough",
  DONOR_REMNANT: "Donor keeps enough liver",
  ANATOMY_NOT_INELIGIBLE: "Anatomy is suitable",
};
export const plainCheck = (c: string) => CHECK[c] ?? c.toLowerCase().replace(/_/g, " ");

/** One stored reason as a short sentence. Unknown reasons are shown as they are. */
export function plainFact(r: string): string {
  let m: RegExpMatchArray | null;
  if ((m = r.match(/^(\w+) → (\w+) · same blood group/))) return `Same blood group (${m[1]})`;
  if ((m = r.match(/^(\w+) → (\w+) · O can give/))) return `Blood group O can give to anyone`;
  if (/^virtual test clear/.test(r)) return "No antibody against this donor on file";
  if (/^DQ typed/.test(r)) return "Tissue type fully checked";
  if (/DQ not typed/.test(r)) return "Part of the tissue type wasn't checked yet, so the lab test matters more";
  if (/^offer accepted/.test(r)) return "Both hospitals said yes";
  if ((m = r.match(/^(left|right) lobe, (\d+) ml, for a ([\d.]+) kg patient: graft is ([\d.]+)%/)))
    return `The ${m[1]} part of the liver (${m[2]} ml) is big enough for a ${m[3]} kg patient`;
  if ((m = r.match(/^donor keeps (\d+)% of their liver/))) return `The donor keeps ${m[1]}% of their liver, enough to stay safe`;
  if (/^left lobe: the smaller operation/.test(r)) return "The smaller operation for the donor";
  if (/measured on CT/.test(r)) return "Liver size measured on a CT scan";
  if (/estimated from height and weight, close to the size limit/.test(r)) return "Liver size is only estimated and close to the limit; the CT scan will decide";
  if (/estimated from height and weight/.test(r)) return "Liver size is estimated until the CT scan";
  if ((m = r.match(/^patient MELD (\d+)/))) return `Patient is very ill (MELD ${m[1]})`;
  if (/^donor evaluation: review required/.test(r)) return "The donor's check-up still needs a review";
  return r;
}

/** A test result in plain words. */
export const plainResult = (r?: string | null) =>
  ({ pending: "not done yet", negative: "passed", positive: "failed", cancelled: "not needed" } as Record<string, string>)[r ?? ""] ?? (r ?? "–");

/** What the status column means, in a few words. */
export const STAGE_WORDS: Record<string, string> = {
  selected: "Chosen this week",
  offered: "Hospitals asked",
  testing: "Tests under way",
  committee: "Papers with the committee",
  locked: "Surgery booked",
  broken: "A test failed",
};
