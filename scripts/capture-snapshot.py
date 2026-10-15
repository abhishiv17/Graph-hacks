"""Record the demo story from the running API into web/lib/demo/snapshot.json.

The web app replays this file when the API is offline, so rerun it whenever the scenario,
the queries or the API responses change. It resets the demo graph.

    python scripts/capture-snapshot.py            # API on http://localhost:8000
    API_URL=http://host:8000 python scripts/capture-snapshot.py
"""
import json
import os
import time
import urllib.request
from pathlib import Path

API = os.getenv("API_URL", "http://localhost:8000")
OUT = Path(__file__).resolve().parents[1] / "web" / "lib" / "demo" / "snapshot.json"
FAMILIES = ["P-0154", "P-0211", "P-0388", "P-0377", "P-0412", "P-0433", "P-0451"]
LIVER_STORY = "P-0412"   # first family of the liver story loop (data/params/india_liver.yaml program.story)


def call(path: str, body: dict | None = None):
    req = urllib.request.Request(API + path, method="POST" if body is not None else "GET",
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read())


def last_seq() -> int:
    ev = call("/api/events")
    return max((e["seq"] for e in ev), default=0)


def main() -> None:
    s: dict = {"captured_at": int(time.time() * 1000)}
    cut: dict = {}
    call("/api/demo/reset", {})
    s["pool_loaded"] = call("/api/pool")
    cut["loaded"] = last_seq()

    call("/api/demo/add-chennai", {})
    s["pool_chennai"] = call("/api/pool")
    cut["chennai"] = last_seq()
    focus = next(l["loop_id"] for l in s["pool_chennai"]["loops"] if any(p["pair_id"] == "P-0154" for p in l["pairs"]))
    s["focus_loop"] = focus
    s["loops_before"] = {l["loop_id"]: call(f"/api/loops/{l['loop_id']}") for l in s["pool_chennai"]["loops"]}
    s["committee_before"] = call("/api/committee")
    s["me"] = call("/api/me")
    s["programs"] = call("/api/programs")
    s["pairs"] = call("/api/pairs")
    s["simulations"] = call("/api/simulations")
    s["integrity_before"] = call("/api/integrity")
    liver = next(l["loop_id"] for l in s["pool_chennai"]["loops"] if any(p["pair_id"] == LIVER_STORY for p in l["pairs"]))
    s["liver_focus_loop"] = liver
    s["liver_loop_before"] = s["loops_before"][liver]

    s["lab_result"] = call(f"/api/loops/{focus}/lab", {})
    s["loop_broken"] = call(f"/api/loops/{focus}")
    s["pool_broken"] = call("/api/pool")
    cut["broken"] = last_seq()

    task = s["pool_broken"]["open_tasks"][0]["task_id"]
    s["approve_result"] = call(f"/api/tasks/{task}/approve", {"choice": "recommended"})
    s["loop_old_after"] = call(f"/api/loops/{focus}")
    s["loop_repaired"] = call(f"/api/loops/{s['approve_result']['loop_id']}")
    s["pool_repaired"] = call("/api/pool")
    cut["repaired"] = last_seq()

    s["committee"] = call("/api/committee")
    s["integrity_after"] = call("/api/integrity")
    # The liver story runs after the kidney one, so the kidney stages above are unchanged.
    s["liver_lab_result"] = call(f"/api/loops/{liver}/lab", {})
    s["liver_loop_broken"] = call(f"/api/loops/{liver}")
    s["family"] = {f"{p}|{lang}": call(f"/api/family/{p}?lang={lang}") for p in FAMILIES for lang in ("en", "hi")}
    s["events"] = call("/api/events")
    s["audit"] = call("/api/audit")
    s["event_cutoff"] = cut
    s["queries"] = call("/api/queries")
    s["sim"] = call("/api/sim")
    s["graph_overview"] = call("/api/graph/overview")
    s["hospital"] = {h["code"]: call(f"/api/hospital/{h['code']}") for h in s["pool_loaded"]["hospitals"]}

    OUT.write_text(json.dumps(s, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    call("/api/demo/reset", {})  # leave the live demo at its starting point
    print(f"Wrote {OUT} (kidney loop {focus}, liver loop {liver}, event cut-offs {cut})")


if __name__ == "__main__":
    main()
