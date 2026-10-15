import type { Tone } from "@/lib/data/derive";

/** How each health-watch stage reads: calm to urgent. */
export const STAGE_TONE: Record<string, Tone> = { stable: "ok", watch: "neutral", prepare: "warn", act: "bad" };

export const fmtDay = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
