import type { MemoryItem } from "@/lib/data/types";

const day = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** What an answer read from memory instead of working out now, with when each piece was learned and by which agent. */
export default function FromMemory({ items, className = "" }: { items?: MemoryItem[] | null; className?: string }) {
  if (!items?.length) return null;
  return (
    <div className={`mt-1.5 rounded-md border px-2 py-1.5 text-[0.7rem] ${className}`} style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
      <p className="font-semibold" style={{ color: "var(--ink-strong)" }}>Answered from memory</p>
      <ul className="mt-0.5 space-y-0.5 muted">
        {items.map((m, i) => (
          <li key={i}><span className="font-medium" style={{ color: "var(--ink)" }}>Learned {day(m.at)}</span> · {m.by}: {m.what}</li>
        ))}
      </ul>
    </div>
  );
}
