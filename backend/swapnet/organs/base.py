"""What an organ plugs into the shared swap engine.

Loop finding, the optimiser, offers, failure memory, local repair, committee papers and approvals are
the same for every organ: they only read CAN_GIVE_TO edges. An organ supplies the parts that differ:
its parameters, the Cypher rule that builds its edges, the test each link goes through before surgery,
what the pool learns when that test fails, and the words families and coordinators read.

Each organ is also a program: its `program` block in data/params (committee checklist, planning timeline,
demo scenario) and its `rules()` say what the platform checks and where each rule comes from. Rules the project
has no authoritative number for are statuses (ELIGIBLE, REVIEW_REQUIRED, UNKNOWN, INELIGIBLE), not thresholds.

Organs never mix: build_edges refuses a pair of another organ, every edge query matches only its own organ,
and the loop queries require one organ per loop.

Add an organ: subclass Organ in swapnet/organs/<name>.py, add its edge query to backend/queries/ and its
parameters (with a `program` block) to data/params/, then register it in swapnet/organs/__init__.py.
"""
from swapnet import config
from swapnet.graph import db

# Every link in every organ satisfies these before it exists (Q02, Q21).
SHARED_CONSTRAINTS = ["ORGAN_TYPE", "BLOOD_COMPATIBILITY", "NO_REMEMBERED_FAILURE"]


class OrganMismatch(ValueError):
    """A pair was sent to another organ's matching rule."""


class Organ:
    name: str = ""
    prefix: str = ""                # loop IDs: S-0076 kidney, L-0031 liver
    params_file: str = ""           # data/params/<file>
    edge_query: str = ""            # backend/queries/<name>.cypher, run once per new pair
    test_kind: str = ""             # stored on Crossmatch nodes
    test_name: str = ""             # "lab crossmatch", "donor work-up (CT volumetry)"
    failure_cause: str = ""         # Failure.cause when the test rules a link out
    passed_reason: str = ""         # replaces the pre-test risk reasons on a link that passed
    risk_reason_markers: tuple[str, ...] = ()   # reasons containing these are dropped once the test has passed
    hold_reason: str = ""           # why an intake agent holds an offer on a link marked vxm = 'risk'
    done_text: str = "All lab tests negative"
    # Family messages: overrides for narrate.T, per language ({"en": {...}, "hi": {...}}).
    texts: dict[str, dict[str, str]] = {}
    integrity_query: str = ""       # backend/queries/<name>.cypher: this program's completeness checks

    def params(self) -> dict:
        return config.param_file(self.params_file)

    def edge_params(self) -> dict:
        raise NotImplementedError

    def program(self) -> dict:
        """Label, committee checklist, planning timeline and demo scenario (data/params `program`)."""
        return self.params()["program"]

    def rules(self) -> list[dict]:
        """The matching rules this program applies, each with its source. Program configuration, not medical
        authority: [{code, text, source}]."""
        return [{"code": "ORGAN_TYPE", "text": f"donor and patient are both in the {self.name} program", "source": "platform rule"},
                {"code": "BLOOD_COMPATIBILITY", "text": "ABO: O gives to all, A to A and AB, B to B and AB, AB to AB",
                 "source": "standard ABO rule"},
                {"code": "NO_REMEMBERED_FAILURE", "text": "no failed test is remembered between this donor and patient",
                 "source": "platform rule (FAILED edge)"}]

    def constraints(self, link: dict) -> tuple[list[str], list[str]]:
        """(constraints this link satisfies, flags a person should look at), from the facts on its edge."""
        return list(SHARED_CONSTRAINTS), []

    def build_edges(self, pair_id: str) -> int:
        r = db.raw("MATCH (p:Pair {pair_id: $id}) RETURN p.organ AS o", {"id": pair_id})
        if r and (r[0]["o"] or "kidney") != self.name:
            raise OrganMismatch(f"{pair_id} is a {r[0]['o']} pair; the {self.name} rule cannot build its links")
        rows = db.run(self.edge_query, {"pair_id": pair_id, **self.edge_params()})
        return rows[0]["edges"] if rows else 0

    def lab_pair(self, donor_pair: str, patient_pair: str) -> str:
        """Whose hospital runs the test."""
        return patient_pair

    def run_test(self, donor_pair: str, donor_hospital: str, patient_pair: str) -> dict:
        """{"result": "negative"} or {"result": "positive", "antibody": short finding, "detail": sentence}."""
        raise NotImplementedError

    def learn_after_failure(self, donor_pair: str, patient_pair: str, hospital_of) -> None:
        """The test revealed something the pool didn't know: record it and rebuild that donor's links."""

    def priority(self, patient: dict, weights: dict) -> float:
        return 0.0

    def own_clash(self, family: dict) -> str:
        return "blood groups clash"

    def background(self, n: int, hospitals: list[str], seed: int) -> list:
        """Synthetic pairs for this organ's demo pool."""
        raise NotImplementedError

    def hospitals(self) -> list[str]:
        """Hospitals with a programme for this organ (hospitals.yaml `organs`)."""
        return [h["code"] for h in config.hospitals()["hospitals"] if self.name in h.get("organs", ["kidney"])]

    # Event text, so the feed reads right for each organ.
    def passed_event(self, donor_city: str, patient_city: str, route: str, link: str) -> str:
        raise NotImplementedError

    def failed_event(self, donor_city: str, patient_city: str, link: str, res: dict) -> str:
        raise NotImplementedError
