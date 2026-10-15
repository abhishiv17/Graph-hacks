"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import FamilyExplorer from "@/components/app/FamilyExplorer";
import { Family } from "@/components/Kin";
import { OrganTag } from "@/components/app/ui";
import { useResource } from "@/lib/data/source";
import type { PairFacts } from "@/lib/data/types";

// Families worth a first look: the two followed patients and the exchange story's families.
const CHIPS = [
  { id: "P-0901", label: "Sunita's family" }, { id: "P-0902", label: "Rajesh's family" },
  { id: "P-0154", label: "Hyderabad (swap S-0076)" }, { id: "P-0211", label: "Bengaluru (S-0076)" }, { id: "P-0388", label: "Kolkata (S-0076)" },
];

export default function FamilyPage({ params }: { params: Promise<{ pair: string }> }) {
  const { pair: raw } = use(params);
  const pair = decodeURIComponent(raw).toUpperCase();
  const router = useRouter();
  const list = useResource<{ pairs: PairFacts[] }>("pairs", (a) => a.pairs());
  const f = list.data?.pairs.find((p) => p.pair_id === pair);
  const [q, setQ] = useState("");
  const go = (id: string) => router.push(`/families/${id}`);
  const hits = q.trim().length >= 2 ? (list.data?.pairs ?? []).filter((p) => `${p.pair_id} ${p.city}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6) : [];
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end gap-5">
        <Family id={pair} size={68} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: "var(--forest-mid)" }}>A family in the graph</p>
          <h1 className="mt-1 text-[1.9rem] leading-tight font-semibold tracking-[-0.02em]" style={{ color: "var(--ink-strong)" }}>Who can this family swap with?</h1>
          <p className="mt-1 text-[0.95rem] muted">
            {f ? <>{pair} · {f.city} · <OrganTag organ={f.organ} /> · the donor is the patient&rsquo;s {f.donor_relation}, blood group {f.donor_abo} → {f.patient_abo}.</> : pair}
            {" "}Click any circle to see what it is and how it connects. Change the hops to look further out.
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a family by ID or city…" aria-label="Find a family"
                 onKeyDown={(e) => { if (e.key === "Enter" && hits[0]) { go(hits[0].pair_id); setQ(""); } }}
                 className="w-72 rounded-full border px-4 py-2 text-sm outline-none focus:border-[var(--forest-mid)]" style={{ borderColor: "var(--line)", background: "var(--surface)" }} />
          {hits.length > 0 && (
            <ul className="absolute z-30 mt-1 w-72 rounded-xl border p-1 shadow-lg" style={{ background: "var(--surface)", borderColor: "var(--line)" }}>
              {hits.map((h) => (
                <li key={h.pair_id}><button className="w-full rounded-lg px-3 py-1.5 text-left text-sm hover:bg-[var(--surface-soft)]" onClick={() => { go(h.pair_id); setQ(""); }}>
                  <span className="font-semibold">{h.pair_id}</span> <span className="muted">{h.city} · {h.organ}</span></button></li>
              ))}
            </ul>
          )}
        </div>
        {CHIPS.map((c) => (
          <button key={c.id} onClick={() => go(c.id)} className="rounded-full px-3 py-1.5 text-sm font-medium transition-colors"
                  style={{ background: c.id === pair ? "var(--forest)" : "var(--sage)", color: c.id === pair ? "#fff" : "var(--forest)" }}>{c.label}</button>
        ))}
      </div>

      <FamilyExplorer key={pair} pair={pair} onExplore={go} />

      {f?.loop_id && (
        <p className="text-sm">This family is in swap <Link href={`/swaps/${f.loop_id}`} className="font-semibold underline" style={{ color: "var(--forest)" }}>{f.loop_id}</Link>
          {" "}({f.status}). The explorer above shows every swap the graph could make for them, not only the one chosen.</p>
      )}
    </div>
  );
}
