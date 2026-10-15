import { BRAND } from "@/lib/brand";
import { KIDNEY } from "@/components/landing/paint";

type Tone = "light" | "dark";
const MARK: Record<Tone, [string, string, string]> = {
  // [donor kidney, recipient kidney, connecting thread]
  light: ["#2C5A4B", "#C96E64", "#183B32"],
  dark: ["#A6D8B5", "#E39A90", "#F7F6F0"],
};

/** Two kidneys, one from each family, leaning together. A thread runs between them: the exchange. */
export function LogoMark({ size = 32, tone = "light", className }: { size?: number; tone?: Tone; className?: string }) {
  const [a, b, t] = MARK[tone];
  return (
    <svg width={size} height={size * (150 / 210)} viewBox="5 5 210 150" className={className} aria-hidden="true">
      <g transform="translate(30 6) rotate(-24 50 70)"><path d={KIDNEY} fill={a} /></g>
      <g transform="translate(190 6) scale(-1 1) rotate(-24 50 70)"><path d={KIDNEY} fill={b} /></g>
      <path d="M58 118 C84 150 136 150 162 118" fill="none" stroke={t} strokeWidth="9" strokeLinecap="round" opacity="0.9" />
      <circle cx="58" cy="118" r="9" fill={t} />
      <circle cx="162" cy="118" r="9" fill={t} />
    </svg>
  );
}

/** The wordmark: "Kind" in the ink colour, "Red" in coral. */
export function Wordmark({ tone = "light", className, size = "1.2rem" }: { tone?: Tone; className?: string; size?: string }) {
  return (
    <span className={`font-semibold tracking-[-0.02em] ${className ?? ""}`} style={{ fontSize: size, lineHeight: 1 }} aria-label={BRAND.name}>
      <span style={{ color: tone === "dark" ? "#F7F6F0" : "#183B32" }}>Kind</span>
      <span style={{ color: tone === "dark" ? "#E39A90" : "#B4564C" }}>Red</span>
    </span>
  );
}

export function Logo({ tone = "light", className, size = 30 }: { tone?: Tone; className?: string; size?: number }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <LogoMark size={size} tone={tone} />
      <Wordmark tone={tone} size={`${(size / 30) * 1.25}rem`} />
    </span>
  );
}
