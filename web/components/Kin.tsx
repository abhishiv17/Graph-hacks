/**
 * Kin, KindRed's mascot: the keeper of the red thread. The thread is tied in a loop with three beads, one per family:
 * a swap, where each family's donor gives to the next family's patient. Kin is round on purpose, not organ-shaped, so it
 * stands for every program (kidney and liver) and for the people, not the organ. As the guide, Kin wears a nurse's cap
 * (a heart on it, never a red cross: that emblem is protected). Families are drawn as Kin's relatives: their own colour,
 * an accessory, and one bead from the thread. Every drawing is original to KindRed.
 */
export type KinPose = "wave" | "idle" | "think" | "cheer";
export type KinPalette = "mint" | "peach" | "sky" | "sand" | "lilac";
export type KinAccessory = "tuft" | "nurse" | "bow" | "glasses" | "none";

const INK = "#183B32";
const THREAD = "#C9564B";
const CHEEK = "#EE9F95";
// The three families on the thread: kidney green, liver amber, KindRed coral.
const BEADS = ["#2C5A4B", "#D99A35", "#E07A6E"];
const PALETTES: Record<KinPalette, [string, string]> = {
  mint: ["#BFE3C8", "#E6F3E8"],
  peach: ["#F6CDBE", "#FBE6DD"],
  sky: ["#C5DDEE", "#E5EFF7"],
  sand: ["#EAD9B4", "#F5ECD8"],
  lilac: ["#D8CDEB", "#EEE8F6"],
};

function Arm({ d, body }: { d: string; body: string }) {
  return (
    <>
      <path d={d} fill="none" stroke={INK} strokeWidth="15" strokeLinecap="round" />
      <path d={d} fill="none" stroke={body} strokeWidth="8" strokeLinecap="round" />
    </>
  );
}

const ARMS: Record<KinPose, [string, string]> = {
  idle: ["M22 86 Q12 94 15 104", "M98 86 Q108 94 105 104"],
  wave: ["M22 86 Q12 94 15 104", "M99 80 Q110 72 108 60"],
  think: ["M22 86 Q12 94 15 104", "M99 84 Q108 76 100 70"],
  cheer: ["M21 80 Q10 70 13 58", "M99 80 Q110 70 107 58"],
};

export function Kin({ size = 64, pose = "wave", palette = "mint", accessory = "tuft", thread = "loop", bead, className, title }: {
  size?: number; pose?: KinPose; palette?: KinPalette; accessory?: KinAccessory;
  /** "loop": the whole swap (three beads); "bead": one family member's bead (`bead` colour); "none". */
  thread?: "loop" | "bead" | "none"; bead?: string; className?: string; title?: string;
}) {
  const [left, right] = ARMS[pose];
  const [body, belly] = PALETTES[palette];
  return (
    <svg width={size} height={size * (140 / 120)} viewBox="0 0 120 140" className={className}
         role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {/* feet */}
      <ellipse cx="46" cy="126" rx="11" ry="6" fill={INK} />
      <ellipse cx="74" cy="126" rx="11" ry="6" fill={INK} />
      <Arm d={left} body={body} />
      <Arm d={right} body={body} />
      {/* body */}
      <path d="M60 22 C89 22 104 47 104 77 C104 106 86 124 60 124 C34 124 16 106 16 77 C16 47 31 22 60 22 Z"
            fill={body} stroke={INK} strokeWidth="3.5" />
      <ellipse cx="60" cy="96" rx="27" ry="21" fill={belly} />
      {/* the red thread: a curl on top, then a loop across the body with one bead per family */}
      {accessory === "tuft" && <path d="M60 22 C57 12 64 6 70 9 C76 12 73 19 66 17" fill="none" stroke={THREAD} strokeWidth="3.5" strokeLinecap="round" />}
      {thread !== "none" && <path d="M19 92 C36 108 84 108 101 92" fill="none" stroke={THREAD} strokeWidth="3.5" strokeLinecap="round" />}
      {thread === "loop" && [[34, 102], [60, 108], [86, 102]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="5.5" fill={BEADS[i]} stroke={INK} strokeWidth="2" />
      ))}
      {thread === "bead" && <circle cx="60" cy="108" r="6" fill={bead ?? BEADS[2]} stroke={INK} strokeWidth="2" />}
      {/* accessories */}
      {accessory === "nurse" && (
        <g>
          <path d="M37 33 L43 13 Q60 9 77 13 L83 33 Q60 27 37 33 Z" fill="#FFFFFF" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M60 28 C54 23.5 54 18.5 57.5 18 C59 17.8 60 19 60 20.2 C60 19 61 17.8 62.5 18 C66 18.5 66 23.5 60 28 Z" fill="#E07A6E" />
        </g>
      )}
      {accessory === "bow" && (
        <g stroke={INK} strokeWidth="2.5" strokeLinejoin="round">
          <path d="M42 30 L30 22 L31 37 Z" fill="#E07A6E" />
          <path d="M42 30 L54 22 L53 37 Z" fill="#E07A6E" />
          <circle cx="42" cy="30" r="3.6" fill="#C9564B" />
        </g>
      )}
      {/* face */}
      {pose === "cheer" ? (
        <>
          <path d="M40 64 Q46 57 52 64" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
          <path d="M68 64 Q74 57 80 64" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
        </>
      ) : (
        <>
          <ellipse cx="46" cy="63" rx="4.6" ry="6.2" fill={INK} />
          <ellipse cx="74" cy="63" rx="4.6" ry="6.2" fill={INK} />
          <circle cx="47.6" cy="60.6" r="1.6" fill="#fff" />
          <circle cx="75.6" cy="60.6" r="1.6" fill="#fff" />
        </>
      )}
      {accessory === "glasses" && (
        <g fill="rgba(255,255,255,0.25)" stroke={INK} strokeWidth="2.6">
          <circle cx="46" cy="63" r="10" />
          <circle cx="74" cy="63" r="10" />
          <path d="M56 62 Q60 59 64 62" fill="none" />
        </g>
      )}
      <ellipse cx="36" cy="77" rx="6" ry="3.8" fill={CHEEK} opacity="0.85" />
      <ellipse cx="84" cy="77" rx="6" ry="3.8" fill={CHEEK} opacity="0.85" />
      {pose === "think"
        ? <ellipse cx="62" cy="80" rx="3" ry="3.4" fill={INK} />
        : <path d={pose === "cheer" ? "M50 76 Q60 89 70 76 Z" : "M52 77 Q60 85 68 77"} fill={pose === "cheer" ? INK : "none"} stroke={INK} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
      {pose === "think" && <text x="96" y="30" fontSize="22" fontWeight="700" fill={THREAD} fontFamily="var(--font-sans), sans-serif">?</text>}
      {pose === "cheer" && (
        <g fill="#D99A35">
          <path d="M14 28 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5Z" />
          <path d="M104 22 l2 4.5 4.5 2 -4.5 2 -2 4.5 -2 -4.5 -4.5 -2 4.5 -2Z" />
        </g>
      )}
    </svg>
  );
}

/** Kin as the guide: the nurse's cap and the whole thread. */
export function Guide(props: { size?: number; pose?: KinPose; className?: string; title?: string }) {
  return <Kin accessory="nurse" {...props} />;
}

type Member = { role: string; palette: KinPalette; accessory: KinAccessory };
const FAMILIES: Record<string, { bead: string; patient: Member; donor: Member }> = {
  // Demo patients (data/params/personas.yaml): who needs the transplant, and who wants to donate.
  sunita: { bead: "#2C5A4B", patient: { role: "Sunita", palette: "peach", accessory: "bow" }, donor: { role: "her husband", palette: "sky", accessory: "glasses" } },
  rajesh: { bead: "#D99A35", patient: { role: "Rajesh", palette: "sand", accessory: "glasses" }, donor: { role: "his daughter", palette: "lilac", accessory: "bow" } },
};
const PAL: KinPalette[] = ["peach", "sky", "sand", "lilac"];
const ACC: KinAccessory[] = ["bow", "glasses", "none", "bow"];

function familyOf(id: string) {
  const known = FAMILIES[id.toLowerCase()];
  if (known) return known;
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { bead: BEADS[h % 3], patient: { role: "patient", palette: PAL[h % 4], accessory: ACC[h % 4] },
           donor: { role: "donor", palette: PAL[(h + 1) % 4], accessory: ACC[(h + 2) % 4] } };
}

/** A family as two of Kin's relatives, the patient and the donor, each wearing the family's bead from the thread. */
export function Family({ id, size = 40, className }: { id: string; size?: number; className?: string }) {
  const f = familyOf(id);
  return (
    <span className={`inline-flex items-end ${className ?? ""}`} aria-hidden="true">
      <Kin size={size} pose="idle" palette={f.patient.palette} accessory={f.patient.accessory} thread="bead" bead={f.bead} />
      <Kin size={size * 0.86} pose="wave" palette={f.donor.palette} accessory={f.donor.accessory} thread="bead" bead={f.bead} className="-ml-2" />
    </span>
  );
}

/** The same family drawn inside another SVG (a graph node): the patient and the donor, side by side, centred on 0,0. */
export function FamilyGlyph({ id, size = 30 }: { id: string; size?: number }) {
  const f = familyOf(id);
  const h = size * (140 / 120);
  return (
    <g transform={`translate(${-size * 0.92} ${-h / 2})`} aria-hidden="true">
      <Kin size={size} pose="idle" palette={f.patient.palette} accessory={f.patient.accessory} thread="bead" bead={f.bead} />
      <g transform={`translate(${size * 0.84} ${h * 0.12})`}>
        <Kin size={size * 0.86} pose="wave" palette={f.donor.palette} accessory={f.donor.accessory} thread="bead" bead={f.bead} />
      </g>
    </g>
  );
}
