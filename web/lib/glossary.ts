// Plain-language definitions shown when someone hovers or taps a dotted term.
export const GLOSSARY = {
  pair: "A patient and the family member who wants to donate to them, but can't, because their blood or tissue doesn't match.",
  swap: "Families trade donors. Family A's donor gives to family B's patient, and B's donor gives to A's patient.",
  loop: "A closed ring of swaps. In a 3-way loop, A gives to B, B to C, and C back to A. Every link must hold or the loop breaks.",
  link: "One planned donation: the donor from one family gives a kidney to the patient of another family.",
  fallback: "A smaller 2-way swap hidden inside a 3-way loop. If the third family drops out, these two can still go ahead.",
  crossmatch: "A lab test that mixes the patient's blood with the donor's cells. Positive means the patient would reject that kidney.",
  virtualCrossmatch: "A check done in the graph before any lab test: does the patient carry an antibody against one of the donor's tissue types?",
  cpra: "How many donors a patient reacts against, from 0 to 100%. A patient with cPRA 91% can't accept 91 of 100 random donors, so they are hard to match.",
  expected: "Transplants we expect after counting the chance that each link fails. A 3-way loop where each link is 80% likely gives about 1.5, not 3.",
  chance: "The chance that every link in the loop passes its lab test and both hospitals go ahead.",
  committee: "The legal Authorisation Committee that must approve every swap in India. Each family needs its own papers, so one missing paper holds up the whole loop.",
  repair: "When a link fails, KindRed searches the families close to the break for a replacement. A coordinator must approve it before anything changes.",
  hla: "Tissue types (A, B, DR, DQ). If a patient has antibodies against a donor's tissue type, the kidney would be rejected.",
  untyped: "A tissue type the lab never tested for this donor. The virtual check can't see it, so the real lab test is riskier.",
  graph: "KindRed stores families, donations, loops, tests and decisions as connected nodes in FalkorDB, so it can follow chains of connections (multi-hop) in one query.",
  bridge: "A waiting family that connects many possible swaps (highest betweenness in the graph). If they withdraw, many future options disappear.",
  tenant: "Each hospital has its own private graph with names and documents. Only the medical facts needed for matching are shared in the exchange graph.",
} as const;
export type GlossaryKey = keyof typeof GLOSSARY;
