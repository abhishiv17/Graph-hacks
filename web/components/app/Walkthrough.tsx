"use client";
// "Explain this graph": a guided walkthrough over a graph. Each step is one sentence built from graph data on the
// server; the graph highlights what the step talks about, and Sarvam reads it aloud in the chosen language.
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { LANGS, speak, type Walk, type WalkStep } from "@/lib/walkthrough";

export default function Walkthrough({ load, onStep, label = "Explain this graph" }: {
  load: (lang: string) => Promise<Walk>; onStep: (s: WalkStep | null) => void; label?: string;
}) {
  const [lang, setLang] = useState("en-IN");
  const [walk, setWalk] = useState<Walk | null>(null);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const timer = useRef<number | null>(null);

  const stopSound = () => {
    audio.current?.pause();
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const close = useCallback(() => { stopSound(); setWalk(null); setPlaying(false); onStep(null); }, [onStep]);
  useEffect(() => () => stopSound(), []);

  const start = async () => {
    setBusy(true); setError(null);
    try {
      const w = await load(lang);
      setWalk(w); setI(0); setPlaying(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // Show the step on the graph, read it, then move on when the voice ends (or after a reading pause).
  useEffect(() => {
    if (!walk) return;
    const s = walk.steps[i];
    onStep(s);
    stopSound();
    if (!playing) return;
    const next = () => { if (i < walk.steps.length - 1) setI(i + 1); else setPlaying(false); };
    const pause = () => { timer.current = window.setTimeout(next, Math.max(3500, s.text.split(" ").length * 330)); };
    if (voiceOn && walk.voice) {
      let alive = true;
      speak(s.spoken, walk.lang).then((url) => {
        if (!alive) return;
        const a = audio.current ?? new Audio();
        audio.current = a;
        a.src = url;
        a.onended = () => { timer.current = window.setTimeout(next, 500); };
        a.play().catch(pause);
      }).catch(pause);
      if (walk.steps[i + 1]) speak(walk.steps[i + 1].spoken, walk.lang).catch(() => {});  // the next one, ready in time
      return () => { alive = false; };
    }
    pause();
  }, [walk, i, playing, voiceOn]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!walk) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-sm btn-primary" onClick={start} disabled={busy}>
          <Icon name="play" size={14} /> {busy ? "Preparing…" : label}
        </button>
        <label className="sr-only" htmlFor="walk-lang">Language</label>
        <select id="walk-lang" value={lang} onChange={(e) => setLang(e.target.value)} className="rounded-md border px-2 py-1 text-sm"
                style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
          {LANGS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {error && <span className="text-xs" style={{ color: "var(--bad)" }}>{error}</span>}
      </div>
    );
  }
  const s = walk.steps[i];
  return (
    <div className="rounded-xl border p-3 shadow-sm" style={{ borderColor: "var(--forest-mid)", background: "var(--surface)" }} role="region" aria-label="Walkthrough" aria-live="polite">
      <div className="flex items-center gap-2 text-xs muted">
        <span className="font-semibold" style={{ color: "var(--forest)" }}>Step {i + 1} of {walk.steps.length}</span>
        <span className="flex gap-1" aria-hidden="true">
          {walk.steps.map((_, k) => <span key={k} className="h-1.5 w-4 rounded-full" style={{ background: k <= i ? "var(--forest-mid)" : "var(--line)" }} />)}
        </span>
        <span className="ml-auto">{walk.voice && voiceOn ? "Voice by Sarvam" : "Text only"}</span>
      </div>
      <p className="mt-2 text-[0.95rem] leading-relaxed" style={{ color: "var(--ink-strong)" }} lang={walk.lang.slice(0, 2)}>{s.text}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button className="btn btn-sm" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0} aria-label="Previous step">←</button>
        <button className="btn btn-sm" onClick={() => setPlaying((p) => !p)}>{playing ? "Pause" : "Play"}</button>
        <button className="btn btn-sm" onClick={() => setI(Math.min(walk.steps.length - 1, i + 1))} disabled={i === walk.steps.length - 1} aria-label="Next step">→</button>
        {walk.voice && <button className="btn btn-sm" onClick={() => setVoiceOn((v) => !v)} aria-pressed={voiceOn}>{voiceOn ? "Voice on" : "Voice off"}</button>}
        <button className="btn btn-sm ml-auto" onClick={close}>Close</button>
      </div>
      <p className="mt-2 text-[0.7rem] muted">{walk.source}</p>
    </div>
  );
}
