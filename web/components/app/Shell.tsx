"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons";
import { Logo } from "@/components/Logo";
import DemoGuide from "./DemoGuide";
import { DataProvider, useData, useResource } from "@/lib/data/source";
import { fmtTime, loopRoute } from "@/lib/data/derive";

export const NAV_GROUPS = [
  { title: "Run the exchange", items: [
    { href: "/pool", label: "Live pool", icon: "pool", sub: "Map of every planned donation" },
    { href: "/swaps", label: "Swaps", icon: "swaps", sub: "Lab tests, failures, repairs" },
    { href: "/committee", label: "Committee papers", icon: "committee", sub: "Legal approvals and deadlines" },
    { href: "/case/P-0154", label: "Family view", icon: "family", sub: "What a family sees" },
  ] },
  { title: "Understand it", items: [
    { href: "/lab", label: "Guided replay", icon: "replay", sub: "A failure and repair, step by step" },
    { href: "/impact", label: "Impact", icon: "lab", sub: "A simulated year, measured" },
    { href: "/graph", label: "How it works", icon: "database", sub: "FalkorDB graphs, queries, agents" },
    { href: "/audit", label: "Audit trail", icon: "audit", sub: "Every action and decision" },
  ] },
];
export const NAV = NAV_GROUPS.flatMap((g) => g.items);

function crumbs(path: string): { label: string; href?: string }[] {
  const seg = path.split("/").filter(Boolean);
  if (seg[0] === "case") return [{ label: `Family view · ${seg[1]}` }];
  const base = NAV.find((n) => path === n.href || path.startsWith(n.href + "/"));
  if (!base) return [];
  return seg.length > 1 ? [{ label: base.label, href: base.href }, { label: decodeURIComponent(seg[1]) }] : [{ label: base.label }];
}
const isActive = (path: string, href: string) => path === href || path.startsWith(href + "/") || (href.startsWith("/case/") && path.startsWith("/case/"));

function NavList({ path, onNavigate }: { path: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Workspace" className="flex-1 px-3 py-2 overflow-y-auto">
      {NAV_GROUPS.map((g) => (
        <div key={g.title} className="mb-5">
          <p className="px-3 pb-1.5 text-[0.66rem] font-semibold uppercase tracking-[0.14em]" style={{ color: "#6F8F80" }}>{g.title}</p>
          <ul className="space-y-0.5">
            {g.items.map((n) => {
              const on = isActive(path, n.href);
              return (
                <li key={n.href}>
                  <Link href={n.href} onClick={onNavigate} aria-current={on ? "page" : undefined}
                        className="relative flex items-start gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-white/5"
                        style={{ background: on ? "rgba(166,216,181,0.14)" : undefined }}>
                    {on && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full" style={{ background: "var(--mint)" }} aria-hidden="true" />}
                    <span className="mt-0.5" style={{ color: on ? "#FFFFFF" : "#B9CBBF" }}><Icon name={n.icon} size={18} /></span>
                    <span className="min-w-0">
                      <span className="block text-[0.9rem] leading-tight" style={{ color: on ? "#FFFFFF" : "#D5E3DA", fontWeight: on ? 600 : 500 }}>{n.label}</span>
                      <span className="block text-[0.72rem] leading-snug mt-0.5" style={{ color: "#7E9A8B" }}>{n.sub}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Popover({ children, onClose, align = "right", width = "w-80" }: { children: React.ReactNode; onClose: () => void; align?: "right" | "left"; width?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.parentElement?.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [onClose]);
  return (
    <div ref={ref} className={`absolute ${align === "right" ? "right-0" : "left-0"} top-full mt-2 z-50 ${width} max-w-[calc(100vw-2rem)] rounded-xl border p-3 shadow-[0_12px_32px_-12px_rgba(16,42,36,0.35)]`}
         style={{ background: "var(--surface)", borderColor: "var(--line)" }}>
      {children}
    </div>
  );
}

/** Only says something when it matters: the API is unreachable and screens show the recorded snapshot. */
function OfflineChip() {
  const { mode, retryLive } = useData();
  if (mode !== "offline") return null;
  return (
    <button className="hidden sm:inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: "#ecd9b4", background: "var(--warn-soft)", color: "var(--warn)" }}
            onClick={() => retryLive()} title="The API isn't responding; showing the last recorded state. Click to reconnect.">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--warn-mark)" }} /> Offline · reconnect
    </button>
  );
}

function Notifications() {
  const pool = useResource("pool", (a) => a.pool(), 5000);
  const [open, setOpen] = useState(false);
  const tasks = pool.data?.open_tasks ?? [];
  const esc = pool.data?.escalations ?? [];
  const count = tasks.length + esc.length;
  return (
    <div className="relative">
      <button className="relative grid h-9 w-9 place-items-center rounded-full hover:bg-[var(--surface-soft)]" onClick={() => setOpen((o) => !o)} aria-label={`Notifications, ${count} waiting`} aria-expanded={open}>
        <Icon name="bell" size={19} />
        {count > 0 && <span className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--bg)]" style={{ background: "var(--bad-mark)" }} />}
      </button>
      {open && (
        <Popover onClose={() => setOpen(false)}>
          <p className="px-1 text-sm font-semibold" style={{ color: "var(--ink-strong)" }}>Waiting for you</p>
          {count === 0 ? <p className="px-1 py-2 text-sm muted">You&rsquo;re all caught up.</p> : (
            <ul className="mt-1">
              {tasks.map((t) => {
                const l = pool.data?.loops.find((x) => x.loop_id === t.loop_id);
                return (
                  <li key={t.task_id}>
                    <Link href={`/swaps/${t.loop_id}`} onClick={() => setOpen(false)} className="block rounded-lg px-2 py-2 text-sm hover:bg-[var(--surface-soft)]">
                      <span className="font-semibold" style={{ color: "var(--ink-strong)" }}>Repair to review · {t.loop_id}</span>
                      <span className="block muted">{l ? loopRoute(l) : ""} · {fmtTime(t.at)}</span>
                    </Link>
                  </li>
                );
              })}
              {esc.map((e) => (
                <li key={e.task_id}>
                  <Link href={`/swaps/${e.loop_id}`} onClick={() => setOpen(false)} className="block rounded-lg px-2 py-2 text-sm hover:bg-[var(--surface-soft)]">
                    <span className="font-semibold" style={{ color: "var(--ink-strong)" }}>Papers overdue · {e.loop_id}</span>
                    <span className="block muted">{e.city} {e.pair_id}: {e.missing.map((m) => m.replace(/_/g, " ")).join(", ")} · {e.days_left} days left</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Popover>
      )}
    </div>
  );
}

function Search() {
  const pool = useResource("pool", (a) => a.pool());
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2 || !pool.data) return [];
    const out: { href: string; label: string; sub: string }[] = [];
    for (const l of pool.data.loops) {
      if (l.loop_id.toLowerCase().includes(s) || loopRoute(l).toLowerCase().includes(s)) out.push({ href: `/swaps/${l.loop_id}`, label: l.loop_id, sub: loopRoute(l) });
      for (const p of l.pairs) if (p.pair_id.toLowerCase().includes(s)) out.push({ href: `/pool?pair=${p.pair_id}`, label: p.pair_id, sub: `${p.city} · ${l.loop_id}` });
    }
    return out.filter((r, i, a) => a.findIndex((x) => x.href === r.href) === i).slice(0, 8);
  }, [q, pool.data]);
  return (
    <div className="relative hidden md:block">
      <label className="sr-only" htmlFor="ws-search">Search exchanges and pairs</label>
      <div className="flex items-center gap-2 rounded-full border px-3.5 py-2 w-64 xl:w-80" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
        <Icon name="search" size={16} className="muted shrink-0" />
        <input id="ws-search" className="w-full bg-transparent outline-none text-sm" placeholder="Search exchanges or pairs" value={q}
               onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
               onKeyDown={(e) => { if (e.key === "Enter" && results[0]) { router.push(results[0].href); setOpen(false); setQ(""); } }} />
        <kbd className="hidden xl:inline text-[0.68rem] muted border rounded px-1.5" style={{ borderColor: "var(--line)" }}>↵</kbd>
      </div>
      {open && q.trim().length >= 2 && (
        <Popover onClose={() => setOpen(false)} align="left">
          {results.length === 0 ? <p className="px-1 text-sm muted">Nothing matches &ldquo;{q}&rdquo;.</p> : (
            <ul>
              {results.map((r) => (
                <li key={r.href}>
                  <Link href={r.href} onClick={() => { setOpen(false); setQ(""); }} className="block rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--surface-soft)]">
                    <span className="font-semibold" style={{ color: "var(--ink-strong)" }}>{r.label}</span> <span className="muted">{r.sub}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Popover>
      )}
    </div>
  );
}

function Avatar() {
  return (
    <span className="grid h-9 w-9 place-items-center rounded-full text-xs font-bold" style={{ background: "var(--forest)", color: "var(--mint)" }} title="Meera Iyer · Exchange coordinator" aria-label="Signed in as Meera Iyer, exchange coordinator">MI</span>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [menu, setMenu] = useState(false);
  useEffect(() => setMenu(false), [path]);
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menu]);
  const c = crumbs(path);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] btn">Skip to content</a>
      <aside className="hidden lg:flex lg:flex-col sticky top-0 h-screen" style={{ background: "var(--forest-deep)" }}>
        <Link href="/" className="px-6 pt-6 pb-6" aria-label="KindRed home"><Logo tone="dark" size={28} /></Link>
        <NavList path={path} />
      </aside>

      {menu && (
        <div className="lg:hidden fixed inset-0 z-[60]">
          <div className="absolute inset-0" style={{ background: "rgba(16,42,36,0.45)" }} onClick={() => setMenu(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 max-w-[85vw] flex flex-col" style={{ background: "var(--forest-deep)" }} role="dialog" aria-modal="true" aria-label="Navigation">
            <div className="flex items-center justify-between px-6 pt-6 pb-6">
              <Logo tone="dark" size={26} />
              <button className="rounded-md p-1.5 text-white" onClick={() => setMenu(false)} aria-label="Close navigation"><Icon name="close" size={20} /></button>
            </div>
            <NavList path={path} onNavigate={() => setMenu(false)} />
          </aside>
        </div>
      )}

      <div className="min-w-0 flex flex-col">
        <header className="sticky top-0 z-40" style={{ background: "rgba(247,246,240,0.9)", backdropFilter: "blur(10px)" }}>
          <div className="flex items-center gap-3 px-4 sm:px-6 lg:px-10 h-16">
            <button className="lg:hidden grid h-9 w-9 place-items-center rounded-lg border" style={{ borderColor: "var(--line)" }} onClick={() => setMenu(true)} aria-label="Open navigation" aria-expanded={menu}>
              <Icon name="menu" size={18} />
            </button>
            <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
              <ol className="flex items-center gap-1.5 text-sm truncate">
                {c.map((x, i) => (
                  <li key={i} className="flex items-center gap-1.5 min-w-0">
                    {i > 0 && <Icon name="chevron" size={14} className="muted shrink-0" />}
                    {x.href ? <Link href={x.href} className="muted hover:underline truncate">{x.label}</Link>
                      : <span className="font-semibold truncate" style={{ color: "var(--ink-strong)" }} aria-current="page">{x.label}</span>}
                  </li>
                ))}
              </ol>
            </nav>
            <OfflineChip />
            <Search />
            <Notifications />
            <Avatar />
          </div>
        </header>
        <main id="main" className="flex-1 px-4 sm:px-6 lg:px-10 pt-4 pb-12 max-w-[1480px] w-full"><DemoGuide />{children}</main>
      </div>
    </div>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  return <DataProvider><ShellInner>{children}</ShellInner></DataProvider>;
}
