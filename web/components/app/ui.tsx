"use client";
import { useEffect, useRef } from "react";
import { Icon } from "./icons";
import { statusOf, type Tone } from "@/lib/data/derive";
import { ApiError } from "@/lib/api";
import { useData } from "@/lib/data/source";
import { organOf } from "@/lib/organs";

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pb-5 mb-6 border-b" style={{ borderColor: "var(--line)" }}>
      <div className="min-w-0">
        <h1 className="text-[1.65rem] leading-tight font-semibold tracking-[-0.02em]" style={{ color: "var(--ink-strong)" }}>{title}</h1>
        {description && <p className="mt-1.5 max-w-3xl text-[0.94rem] muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

const TONE_CLASS: Record<Tone, string> = { ok: "pill-ok", warn: "pill-warn", bad: "pill-bad", neutral: "pill-neutral", sim: "pill-sim" };
const TONE_GLYPH: Record<Tone, string> = { ok: "check", warn: "alert", bad: "alert", neutral: "", sim: "" };

/** Status never relies on colour alone: each pill has a label and, for warnings and failures, a glyph. */
export function Tag({ tone, children, title }: { tone: Tone; children: React.ReactNode; title?: string }) {
  const g = TONE_GLYPH[tone];
  return <span className={`pill ${TONE_CLASS[tone]}`} title={title}>{g && <Icon name={g} size={12} strokeWidth={2.2} />}{children}</span>;
}
/** Which organ a swap or family is for. Outlined in the organ's colour; on the dark map panels pass `dark`. */
export function OrganTag({ organ, dark }: { organ?: string | null; dark?: boolean }) {
  const o = organOf(organ);
  return <span className="pill" style={{ color: dark ? o.line : o.tone, border: "1px solid currentColor" }}>{o.label}</span>;
}
/** A program evaluation status. These are workflow statuses from program configuration, not diagnoses. */
const EVAL: Record<string, { tone: Tone; label: string }> = {
  ELIGIBLE: { tone: "ok", label: "Eligible" }, REVIEW_REQUIRED: { tone: "warn", label: "Review required" },
  UNKNOWN: { tone: "neutral", label: "Unknown" }, INELIGIBLE: { tone: "bad", label: "Ineligible" },
};
export function EvalTag({ status, title }: { status?: string | null; title?: string }) {
  const e = EVAL[status ?? "UNKNOWN"] ?? EVAL.UNKNOWN;
  return <Tag tone={e.tone} title={title ?? `${e.label} (program status, synthetic)`}>{e.label}</Tag>;
}

/** Marks which side of the privacy boundary a block of data sits on. */
export function DataScope({ scope, dark }: { scope: "shared" | "private"; dark?: boolean }) {
  const shared = scope === "shared";
  return (
    <span className="inline-flex items-center gap-1.5 text-[0.66rem] font-bold uppercase tracking-[0.12em]"
          style={{ color: shared ? (dark ? "#A6D8B5" : "var(--forest-mid)") : (dark ? "#F3DCA9" : "var(--warn)") }}>
      <Icon name={shared ? "pool" : "hospital"} size={13} />{shared ? "Shared exchange data" : "Private to hospital"}
    </span>
  );
}
export function StatusPill({ status, repairReady }: { status: string; repairReady?: boolean }) {
  const s = statusOf(status, repairReady);
  return <Tag tone={s.tone} title={s.hint}>{s.label}</Tag>;
}

export function Kpis({ items }: { items: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: Tone }[] }) {
  return (
    <dl className="grid grid-cols-2 lg:grid-cols-4 border rounded-[10px] overflow-hidden" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
      {items.map((k, i) => (
        <div key={k.label} className={`px-4 py-3.5 ${i % 2 ? "border-l" : ""} ${i > 1 ? "border-t lg:border-t-0" : ""} ${i === 2 ? "lg:border-l" : ""}`} style={{ borderColor: "var(--line)" }}>
          <dt className="label">{k.label}</dt>
          <dd className="mt-1 text-2xl font-semibold tnum" style={{ color: k.tone === "bad" ? "var(--bad)" : k.tone === "warn" ? "var(--warn)" : "var(--ink-strong)" }}>{k.value}</dd>
          {k.sub && <dd className="text-xs muted mt-0.5">{k.sub}</dd>}
        </div>
      ))}
    </dl>
  );
}

export function Section({ title, description, actions, children, className }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={className}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <div>
          <h2 className="text-[1.02rem] font-semibold" style={{ color: "var(--ink-strong)" }}>{title}</h2>
          {description && <p className="text-sm muted mt-0.5">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-[10px] border border-dashed px-5 py-8 text-center" style={{ borderColor: "var(--line-strong)" }}>
      <p className="font-semibold" style={{ color: "var(--ink-strong)" }}>{title}</p>
      {children && <p className="text-sm muted mt-1 max-w-md mx-auto">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** A failed request: says what happened and how to recover, with developer detail folded away. */
export function ErrorState({ error, onRetry, what = "this data" }: { error: Error; onRetry?: () => void; what?: string }) {
  const { mode, retryLive } = useData();
  const status = error instanceof ApiError ? error.status : null;
  const network = !status && /fetch|abort|network/i.test(error.message);
  return (
    <div role="alert" className="rounded-[10px] border px-4 py-3.5" style={{ borderColor: "#e8c9c4", background: "var(--bad-soft)" }}>
      <p className="font-semibold flex items-center gap-2" style={{ color: "var(--bad)" }}>
        <Icon name="alert" size={16} /> {status === 404 ? `Couldn't find ${what}` : `Couldn't load ${what}`}
      </p>
      <p className="text-sm mt-1" style={{ color: "var(--ink)" }}>
        {status === 404 ? error instanceof ApiError ? error.detail : error.message
          : network ? "The KindRed API stopped responding. Check that the backend is running on port 8000, or switch to the offline snapshot."
          : "The API returned an error. Try again; if it keeps happening, check the backend log."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {onRetry && <button className="btn btn-sm" onClick={onRetry}>Try again</button>}
        {mode === "live" && network && <button className="btn btn-sm" onClick={() => retryLive()}>Re-check connection</button>}
      </div>
      <details className="mt-2 text-xs muted"><summary className="cursor-pointer">Technical detail</summary><code className="block mt-1 break-all">{error.message}</code></details>
    </div>
  );
}

export function Loading({ rows = 4, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div aria-busy="true" aria-label={label} className="space-y-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-9 rounded-md animate-pulse" style={{ background: "var(--sage-pale)", width: `${92 - i * 9}%` }} />
      ))}
    </div>
  );
}

/** Marks state that only exists in this browser, so nobody mistakes it for a backend record. */
export function LocalNote({ children = "Saved in this browser only. The backend has no endpoint for this yet." }: { children?: React.ReactNode }) {
  return <p className="text-xs muted flex items-center gap-1.5"><Icon name="database" size={13} /> {children}</p>;
}

export function Drawer({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const prev = useRef<Element | null>(null);
  useEffect(() => {
    if (!open) return;
    prev.current = document.activeElement;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>("a,button,input,select,textarea,[tabindex]:not([tabindex='-1'])");
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); (prev.current as HTMLElement | null)?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0" style={{ background: "rgba(16,42,36,0.32)" }} onClick={onClose} />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
           className={`absolute right-0 top-0 h-full w-full ${wide ? "max-w-2xl" : "max-w-lg"} overflow-y-auto shadow-xl outline-none`}
           style={{ background: "var(--surface)" }}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b px-5 py-3.5" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
          <h2 className="font-semibold" style={{ color: "var(--ink-strong)" }}>{title}</h2>
          <button className="btn btn-sm" onClick={onClose} aria-label="Close"><Icon name="close" size={16} /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt className="label">{label}</dt><dd className="mt-0.5 text-sm" style={{ color: "var(--ink-strong)" }}>{children}</dd></div>;
}
