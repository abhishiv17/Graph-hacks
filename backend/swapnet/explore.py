"""The family explorer: one family as a small graph, broken into its parts, and the families around it hop by hop.

Parts (Q55): the family, its patient and donor, their blood groups, the donor's tissue antigens, the patient's antibodies
and what each reacts with, the hospital and a liver donor's profile. The path that rules out the family's own donor is
marked: a blood-group clash, or the patient's antibody reacting with an antigen the donor carries (kidney), or the
liver rule (liver).

Hops (Q56, Q57): 1 = who this donor can give to and whose donor can give to this patient; 2 = adds 2-way swaps (out and
straight back) and the families one step further; 3 = adds 3-way swaps, the loops that close back at the third hop.
Everything shown is read from the graph; nothing is computed that the graph doesn't hold, except the ordering.
"""
from swapnet import config, organs, programs
from swapnet.graph import db

TOP = 8          # families shown per direction at hop 1
TOP_LOOPS = 3    # swaps shown per size


def _p_all(probs: list) -> float:
    out = 1.0
    for x in probs:
        out *= x or 0
    return round(out, 3)


def family(pair_id: str, hops: int = 1) -> dict | None:
    hops = max(1, min(3, int(hops)))
    with db.track() as tr:
        rows = db.run("Q55_family_parts", {"pair_id": pair_id})
        if not rows:
            return None
        f = rows[0]
        nodes: dict[str, dict] = {}
        edges: dict[str, dict] = {}

        def node(nid: str, type_: str, label: str, sub: str = "", hop: int = 0, **data) -> str:
            if nid not in nodes:
                nodes[nid] = {"id": nid, "type": type_, "label": label, "sub": sub, "hop": hop, "data": data}
            return nid

        def edge(a: str, b: str, type_: str, label: str, **data) -> str:
            eid = f"{a}>{b}:{type_}"
            edges.setdefault(eid, {"id": eid, "from": a, "to": b, "type": type_, "label": label, "mark": None, **data})
            return eid

        # ---- the family's parts
        c = node(f"fam:{pair_id}", "family", pair_id, f"{f['city']} · {f['organ']}", 0, organ=f["organ"], status=f["status"],
                 approval_state=f["approval_state"], city=f["city"], center=True)
        pat = node(f"pat:{pair_id}", "patient", "Patient", f"blood group {f['patient_abo']}", 0, **_clean(f["patient"]))
        don = node(f"don:{pair_id}", "donor", "Donor", f"{f['donor'].get('relation', '')} · blood group {f['donor_abo']}", 0,
                   **_clean(f["donor"]))
        hosp = node(f"hosp:{f['code']}", "hospital", f["city"], "hospital", 0, code=f["code"])
        edge(c, pat, "HAS_PATIENT", "patient")
        edge(c, don, "HAS_DONOR", "donor")
        edge(c, hosp, "REGISTERED_AT", "registered at")
        dg = node(f"abo:{f['donor_abo']}", "blood", f"Group {f['donor_abo']}", "blood group", 0, group=f["donor_abo"])
        pg = node(f"abo:{f['patient_abo']}", "blood", f"Group {f['patient_abo']}", "blood group", 0, group=f["patient_abo"])
        e_dg = edge(don, dg, "HAS_ABO", "blood group")
        e_pg = edge(pat, pg, "HAS_ABO", "blood group")
        if f["liver"]:
            lv = f["liver"]
            node(f"liver:{pair_id}", "liver", "Liver profile", f"{lv.get('volumetry', '')} volumes", 0, **_clean(lv))
            edge(don, f"liver:{pair_id}", "HAS_LIVER", "liver profile")
        donor_antigens = {a["name"] for a in f["antigens"] if a.get("name")}
        for a in f["antigens"]:
            if a.get("name"):
                edge(don, node(f"ag:{a['name']}", "antigen", a["name"], f"tissue antigen · {a.get('locus') or ''}", 0, locus=a.get("locus")),
                     "HAS_ANTIGEN", "carries")
        mfi_min = config.params()["mfi_threshold"]
        clash_edges: list[str] = []
        clash_names: list[str] = []
        for ab in [x for x in f["antibodies"] if x]:
            an = node(f"ab:{ab['name']}", "antibody", f"Anti-{ab['name']}", f"antibody · MFI {ab['mfi']}", 0, mfi=ab["mfi"],
                      reacts_with=ab["reacts_with"])
            e1 = edge(pat, an, "HAS_ANTIBODY", f"antibody, MFI {ab['mfi']}", mfi=ab["mfi"])
            for t in ab["reacts_with"]:
                if t in donor_antigens:  # the antibody reacts with an antigen this family's own donor carries
                    e2 = edge(an, f"ag:{t}", "REACTS_WITH", "reacts with")
                    if ab["mfi"] >= mfi_min:
                        clash_edges += [e1, e2, edge(don, f"ag:{t}", "HAS_ANTIGEN", "carries")]
                        clash_names.append(f"{t} (MFI {ab['mfi']})")
        org = organs.get(f["organ"])
        why_text = org.own_clash({"donor_abo": f["donor_abo"], "patient_abo": f["patient_abo"], "liver": f["liver"],
                                  "patient_weight_kg": f["patient"].get("weight_kg")})
        why_path: list[str] = []
        if not f["own_abo_ok"]:
            why_path = [e_dg, e_pg]
            why_text = f"Blood group {f['donor_abo']} can't give to blood group {f['patient_abo']}"
        elif clash_edges:
            why_path = clash_edges
            why_text = (f"The patient has antibodies against {', '.join(clash_names)}, an antigen their own donor carries, "
                        f"so the body would reject that organ")
        elif f["liver"]:  # the liver rule (graft size or the donor's remnant) rules out their own donor
            why_path = [f"{don}>liver:{pair_id}:HAS_LIVER"]
        for e in why_path:
            edges[e]["mark"] = "own"

        # ---- hops: the families around this one
        outs = db.run("Q56_links_around", {"from": [pair_id], "to": None, "limit": 200})
        ins = db.run("Q56_links_around", {"from": None, "to": [pair_id], "limit": 400})
        loops = [{"pairs": r["pairs"], "probs": r["probs"], "p_all": _p_all(r["probs"]), "size": len(r["pairs"])}
                 for r in db.run("Q57_loops_through", {"pair_id": pair_id})]
        loops.sort(key=lambda l: -l["p_all"])
        two = [l for l in loops if l["size"] == 2]
        three = [l for l in loops if l["size"] == 3]
        shown_loops = (two[:TOP_LOOPS] if hops >= 2 else []) + (three[:TOP_LOOPS] if hops >= 3 else [])
        fams: dict[str, int] = {}
        for r in outs[:TOP]:
            fams.setdefault(r["to_pair"], 1)
        for r in ins[:TOP]:
            fams.setdefault(r["from_pair"], 1)
        for l in shown_loops:
            for i, x in enumerate(l["pairs"][1:], 1):
                fams[x] = min(fams.get(x, 9), i if l["size"] == 3 else 1)
        if hops >= 2:  # one step further out from the families this donor can give to
            first = [r["to_pair"] for r in outs[:6]]
            for r in db.run("Q56_links_around", {"from": first, "to": None, "limit": 60}):
                if r["to_pair"] != pair_id and len([k for k, v in fams.items() if v == 2]) < 10:
                    fams.setdefault(r["to_pair"], 2)
        info = {r["pair_id"]: r for r in programs.pairs(None, list(fams))}
        for pid, hop in fams.items():
            r = info.get(pid, {})
            node(f"fam:{pid}", "family", pid, f"{r.get('city', '')}", hop, organ=r.get("organ"), status=r.get("status"),
                 city=r.get("city"), donor_abo=r.get("donor_abo"), patient_abo=r.get("patient_abo"), cpra=r.get("cpra"),
                 meld=r.get("meld"), loop_id=r.get("loop_id"), relation=r.get("donor_relation"))
        # Only the links that tell the story: into and out of this family, the shown swaps, and the step out to hop 2.
        # (Every link among the shown families would be a hairball: Sunita's at hop 3 is close to 300.)
        loop_links = {(l["pairs"][j], l["pairs"][(j + 1) % l["size"]]) for l in shown_loops for j in range(l["size"])}
        shown = [pair_id, *fams]
        reached: set[str] = set()  # each hop-2 family keeps only its strongest link in (rows come strongest first)
        for r in db.run("Q56_links_around", {"from": shown, "to": shown, "limit": 600}):
            a_, b_ = r["from_pair"], r["to_pair"]
            step_out = hops >= 2 and fams.get(a_) == 1 and fams.get(b_) == 2 and b_ not in reached
            if step_out:
                reached.add(b_)
            keep = pair_id in (a_, b_) or (a_, b_) in loop_links or step_out
            if keep:
                edge(f"fam:{a_}", f"fam:{b_}", "CAN_GIVE_TO", f"can give to · {round((r['p'] or 0) * 100)}%",
                     p=r["p"], reasons=r["reasons"])
        for i, l in enumerate(shown_loops):
            ps = l["pairs"]
            for j, a in enumerate(ps):
                b = ps[(j + 1) % len(ps)]
                eid = f"fam:{a}>fam:{b}:CAN_GIVE_TO"
                if eid in edges:
                    edges[eid]["mark"] = edges[eid]["mark"] or f"loop{l['size']}"
                    edges[eid].setdefault("loops", []).append(i)
    return {
        "center": pair_id, "organ": f["organ"], "hops": hops,
        "nodes": list(nodes.values()), "edges": list(edges.values()),
        "why_not_own": {"text": why_text, "edges": why_path},
        "loops": shown_loops,
        "counts": {"gives_to": len(outs), "receives_from": len(ins), "two_way": len(two), "three_way": len(three),
                   "families_shown": len(fams)},
        "queries": tr.ran,
    }


def _clean(d: dict | None) -> dict:
    return {k: v for k, v in (d or {}).items() if k != "pair_id" and v not in (None, [], "")}
