// What changes on screen between organs. The swap engine is the same for every organ (backend
// swapnet/organs); only the words, the patient facts and the line colour differ. Add an organ here
// when you register one in the backend.

export type OrganName = "kidney" | "liver";

type Facts = { cpra?: number | null; patient_cpra?: number | null; meld?: number | null; patient_meld?: number | null;
  patient_weight_kg?: number | null };

export type OrganView = {
  name: OrganName;
  label: string;          // "Kidney"
  title: string;          // "Kidney paired donation"
  exchange: string;       // "Kidney exchange"
  prefix: string;         // loop IDs: S-0076, L-0034
  familyPair: string;     // the family whose view the demo opens
  storyPairs: string[];   // the scripted demo loop
  gift: string;           // what the donor gives: "a kidney"
  test: string;           // the test every link goes through before surgery
  tests: string;          // plural, for headings and buttons
  run: string;            // button
  running: string;
  passed: string;         // tag on a link that passed
  failed: string;         // tag on a link that failed
  outcome: { negative: string; positive: string };   // how a finished test result reads in a sentence
  hardest: string;        // who is hardest to match, for the pool tile
  chanceNote: string;     // how a link's chance is estimated
  patient: (f: Facts) => string;
  line: string;           // map line colour (on the dark map)
  lineFocus: string;
  tone: string;           // text/tag colour on light surfaces
};

export const ORGANS: Record<OrganName, OrganView> = {
  kidney: {
    name: "kidney", label: "Kidney", gift: "a kidney", title: "Kidney paired donation", exchange: "Kidney exchange",
    prefix: "S-", familyPair: "P-0154", storyPairs: ["P-0154", "P-0211", "P-0388"],
    test: "lab crossmatch", tests: "Lab tests", run: "Run lab tests", running: "Running lab tests…",
    passed: "Lab negative", failed: "Positive", outcome: { negative: "negative", positive: "positive" },
    hardest: "patients with cPRA above 85%",
    chanceNote: "Estimated from published lab-test failure rates, adjusted for how sensitised this patient is and which tissue types the donor was tested for.",
    patient: (f) => `cPRA ${f.cpra ?? f.patient_cpra ?? 0}%`,
    line: "#7DBF97", lineFocus: "#C9F0D6", tone: "var(--kidney)",
  },
  liver: {
    name: "liver", label: "Liver", gift: "part of their liver", title: "Living donor liver paired donation", exchange: "Liver exchange",
    prefix: "L-", familyPair: "P-0451", storyPairs: ["P-0412", "P-0433", "P-0451"],
    test: "donor work-up (CT volumetry)", tests: "Donor work-ups", run: "Run donor work-ups", running: "Running donor work-ups…",
    passed: "Work-up passed", failed: "Work-up failed", outcome: { negative: "passed", positive: "failed" },
    hardest: "liver patients with MELD 25 or more",
    chanceNote: "Estimated from donor work-up failure rates, how ill the patient is (MELD), and whether the donor's liver was measured on CT or only estimated from height and weight.",
    patient: (f) => {
      const meld = f.meld ?? f.patient_meld;
      const kg = f.patient_weight_kg;
      return [meld != null ? `MELD ${meld}` : null, kg != null ? `${kg} kg` : null].filter(Boolean).join(", ");
    },
    line: "#D9AE74", lineFocus: "#F6DDB3", tone: "var(--liver)",
  },
};

export const ORGAN_NAMES = Object.keys(ORGANS) as OrganName[];

/** The organ a loop ID belongs to, from its prefix (S-0076 kidney, L-0034 liver). */
export function organOfLoop(id: string): OrganView | null {
  return Object.values(ORGANS).find((o) => id.startsWith(o.prefix)) ?? null;
}

export function organOf(x?: { organ?: string | null } | string | null): OrganView {
  const name = typeof x === "string" ? x : x?.organ;
  return ORGANS[(name ?? "kidney") as OrganName] ?? ORGANS.kidney;
}
