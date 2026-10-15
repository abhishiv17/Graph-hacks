import { BRAND } from "@/lib/brand";
import { Guide } from "@/components/Kin";

type Tone = "light" | "dark";

/** The mark is Kin, the mascot, in the guide's nurse cap: the keeper of the red thread that ties families into a swap. */
export function LogoMark({ size = 32, className }: { size?: number; tone?: Tone; className?: string }) {
  return <Guide size={size} pose="idle" className={className} />;
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
