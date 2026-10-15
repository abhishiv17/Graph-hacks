// KindRed's illustration kit: brush edges, paint filters, homes, people and the kidney pair.
// Everything is hand-built SVG so the page has its own look and stays sharp at any size.

/* ---------- deterministic noise, so server and client draw the same edges ---------- */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const f1 = (n: number) => Math.round(n * 10) / 10;

/** A painted, uneven top edge running across `w`, closed down to `h`. */
export function brushTop(w: number, h: number, base: number, amp: number, seed: number, step = 9) {
  const r = rng(seed);
  const p1 = r() * 6, p2 = r() * 6, p3 = r() * 6;
  let d = "";
  for (let x = -20, i = 0; x <= w + 20; x += step, i++) {
    const y = base
      + Math.sin(x / 210 + p1) * amp
      + Math.sin(x / 83 + p2) * amp * 0.35
      + Math.sin(x / 31 + p3) * amp * 0.12
      + (r() - 0.5) * amp * 0.22
      + (r() < 0.12 ? (r() - 0.5) * amp * 0.6 : 0);
    d += `${i ? "L" : "M"}${f1(x)},${f1(y)} `;
  }
  return `${d}L${w + 20},${h} L-20,${h} Z`;
}

/** A band with brush edges top and bottom, for night sections and dividers. */
export function brushBand(w: number, h: number, amp: number, seed: number, step = 26) {
  const r = rng(seed);
  const top: string[] = [], bot: string[] = [];
  for (let x = -20; x <= w + 20; x += step) {
    top.push(`${f1(x)},${f1(amp + Math.sin(x / 140 + 1) * amp * 0.6 + (r() - 0.5) * amp * 0.9)}`);
    bot.push(`${f1(x)},${f1(h - amp + Math.sin(x / 170 + 4) * amp * 0.6 + (r() - 0.5) * amp * 0.9)}`);
  }
  return `M${top.join(" L")} L${bot.reverse().join(" L")} Z`;
}

/* ---------- one set of filters for the whole page ---------- */
export function PaintDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <defs>
        {/* roughens edges so shapes read as painted, not vector-cut */}
        <filter id="k-brush" x="-5%" y="-10%" width="110%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.022 0.06" numOctaves="3" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="12" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="k-cloud" x="-20%" y="-30%" width="140%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="2" seed="3" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="18" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="k-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="11" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 0.24  0 0 0 0 0.18  0 0 0 0 0.47  0 0 0 0.55 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        <filter id="k-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <radialGradient id="k-sun" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#F6EBCF" />
          <stop offset="0.45" stopColor="#EBDDBF" stopOpacity="0.75" />
          <stop offset="1" stopColor="#EBDDBF" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="k-ribbon" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#2C5A4B" />
          <stop offset="1" stopColor="#6FAE86" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/* ---------- kidneys ---------- */

// Kidney in a 100 x 140 box, hilum (the notch) on the right.
export const KIDNEY =
  "M50 5 C20 5 5 35 8 70 C10 105 25 135 55 135 C75 135 88 120 85 100 C83 88 72 82 72 70 C72 58 83 52 85 40 C88 18 72 5 50 5 Z";

/** Small kidney centred on (0,0), about 13 x 18 px. */
export function KidneyToken({ fill = "#C96E64" }: { fill?: string }) {
  return (
    <g>
      <path d={KIDNEY} transform="scale(0.13) translate(-47 -70)" fill={fill} />
      <path d="M-2.4,-3.4 C-3.8,-1 -3.8,1.4 -2.4,3.6" transform="translate(-1 0)" stroke="#fff" strokeOpacity="0.6" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </g>
  );
}

/** The two kidneys leaning in to make a heart: KindRed's mark, as reusable art. Draw in a 0 0 220 160 box. */
export function KidneyPair({ faces = false, left = "#4E8A72", right = "#C96E64" }: { faces?: boolean; left?: string; right?: string }) {
  return (
    <g>
      <g transform="translate(30 6) rotate(-24 50 70)"><path d={KIDNEY} fill={left} /></g>
      <g transform="translate(190 6) scale(-1 1) rotate(-24 50 70)"><path d={KIDNEY} fill={right} /></g>
      {faces && (
        <g fill="#102A24">
          <circle cx="66" cy="70" r="5" /><circle cx="88" cy="67" r="5" />
          <path d="M68 86 C74 93 83 92 88 84" stroke="#102A24" strokeWidth="4" fill="none" strokeLinecap="round" />
          <circle cx="132" cy="67" r="5" /><circle cx="154" cy="70" r="5" />
          <path d="M132 84 C137 92 146 93 152 86" stroke="#102A24" strokeWidth="4" fill="none" strokeLinecap="round" />
          <ellipse cx="58" cy="84" rx="7" ry="4" fill="#fff" opacity="0.35" />
          <ellipse cx="162" cy="84" rx="7" ry="4" fill="#fff" opacity="0.35" />
        </g>
      )}
    </g>
  );
}

/* ---------- homes and people ---------- */

/** A family home, centred on its base at (0,0); about 74 px wide. `light` is the window glow class. */
export function Home({ roof = "#C96E64", wall = "#FBF8F1", id }: { roof?: string; wall?: string; id: string }) {
  return (
    <g>
      <ellipse cx="0" cy="2" rx="46" ry="7" fill="#102A24" opacity="0.18" />
      <rect x="22" y="-74" width="9" height="20" rx="2" fill="#9C8B7E" />
      <path d="M-34 -36 L-34 0 L34 0 L34 -36 Z" fill={wall} />
      <path d="M-42 -32 L0 -66 L42 -32 Z" fill={roof} stroke={roof} strokeWidth="6" strokeLinejoin="round" />
      <rect x="-8" y="-22" width="16" height="22" rx="7" fill="#183B32" />
      <rect className={`k-window k-window-${id}`} x="-27" y="-28" width="13" height="12" rx="3" fill="#F2D59A" />
      <rect className={`k-window k-window-${id}`} x="14" y="-28" width="13" height="12" rx="3" fill="#F2D59A" />
    </g>
  );
}

type Hair = "short" | "long" | "bun" | "curly";
/** Head-and-shoulders portrait centred on (0,0), about 44 x 50 px. */
export function Person({ skin, hair, shirt, style }: { skin: string; hair: string; shirt: string; style: Hair }) {
  return (
    <g>
      <path d="M-20 24 C-20 10 -11 5 0 5 C11 5 20 10 20 24 Z" fill={shirt} />
      <rect x="-4" y="-2" width="8" height="9" rx="3" fill={skin} />
      {style === "long" && <path d="M-13 -10 C-15 6 -13 12 -9 14 L9 14 C13 12 15 6 13 -10 Z" fill={hair} />}
      <circle cx="0" cy="-10" r="11" fill={skin} />
      {style === "short" && <path d="M-11.5 -11 C-12 -22 12 -24 11.5 -11 C8 -15 -3 -17 -11.5 -11 Z" fill={hair} />}
      {style === "long" && <path d="M-12 -9 C-13 -24 13 -24 12 -9 C9 -16 -2 -18 -12 -9 Z" fill={hair} />}
      {style === "bun" && (<><circle cx="0" cy="-24" r="5.5" fill={hair} /><path d="M-11.5 -10 C-12 -23 12 -23 11.5 -10 C8 -16 -6 -17 -11.5 -10 Z" fill={hair} /></>)}
      {style === "curly" && (
        <g fill={hair}>
          {[[-9, -17], [-3, -21], [4, -21], [9.5, -16], [-11.5, -11], [11.5, -10]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="5" />)}
        </g>
      )}
      <circle cx="-4" cy="-9" r="1.3" fill="#2A2420" />
      <circle cx="4" cy="-9" r="1.3" fill="#2A2420" />
      <path d="M-3 -4.5 C-1 -2.8 1 -2.8 3 -4.5" stroke="#2A2420" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </g>
  );
}

/** Four-point sparkle centred on (0,0). */
export function Sparkle({ r = 6, fill = "#F7F6F0" }: { r?: number; fill?: string }) {
  return <path d={`M0,${-r} C${r * 0.15},${-r * 0.15} ${r * 0.15},${-r * 0.15} ${r},0 C${r * 0.15},${r * 0.15} ${r * 0.15},${r * 0.15} 0,${r} C${-r * 0.15},${r * 0.15} ${-r * 0.15},${r * 0.15} ${-r},0 C${-r * 0.15},${-r * 0.15} ${-r * 0.15},${-r * 0.15} 0,${-r} Z`} fill={fill} />;
}

/** A soft painted cloud made of overlapping puffs. */
export function Cloud({ x, y, s = 1, fill = "#EAF1E8", className }: { x: number; y: number; s?: number; fill?: string; className?: string }) {
  return (
    <g className={className} transform={`translate(${x} ${y}) scale(${s})`} filter="url(#k-cloud)">
      <ellipse cx="0" cy="0" rx="120" ry="44" fill={fill} />
      <circle cx="-50" cy="-24" r="46" fill={fill} />
      <circle cx="20" cy="-40" r="58" fill={fill} />
      <circle cx="80" cy="-14" r="40" fill={fill} />
    </g>
  );
}

/** A brush-edged band used to move between paper and night sections. */
export function Edge({ flip = false, color, seed }: { flip?: boolean; color: string; seed: number }) {
  return (
    <svg viewBox="0 0 1440 70" preserveAspectRatio="none" className="block w-full h-[46px] sm:h-[70px]" aria-hidden="true"
         style={{ transform: flip ? "scaleY(-1)" : undefined, marginBottom: flip ? 0 : -1, marginTop: flip ? -1 : 0 }}>
      <path d={brushTop(1440, 72, 34, 16, seed, 7)} fill={color} />
    </svg>
  );
}
