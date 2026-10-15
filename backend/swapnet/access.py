"""Program- and hospital-scoped access (data/policies/access.yaml).

There is no authentication in this prototype. `viewer()` takes a demo identity from the X-KindRed-User header and
trusts it; replacing that one function with a real identity provider keeps every check below unchanged. The checks
themselves are enforced on the server: scoped reads filter rows, and actions outside a user's role or scope fail
with 403.
"""
from functools import lru_cache

import yaml
from fastapi import Header, HTTPException

from swapnet import config, organs


@lru_cache
def policy() -> dict:
    return yaml.safe_load((config.DATA / "policies" / "access.yaml").read_text(encoding="utf-8"))


class Viewer:
    def __init__(self, uid: str, rec: dict):
        self.id, self.name, self.role = uid, rec["name"], rec["role"]
        self.scope = rec["scope"]
        self.perms = policy()["roles"][self.role]

    def sees(self, hospital: str | None, organ: str | None) -> bool:
        if self.scope == "all":
            return True
        return organ in self.scope.get(hospital or "", [])

    def programs(self) -> list[str]:
        if self.scope == "all":
            return organs.names()
        return [o for o in organs.names() if any(o in v for v in self.scope.values())]

    def require(self, perm: str) -> None:
        if not self.perms.get(perm):
            raise HTTPException(403, f"{self.name} ({self.perms['label']}) is not allowed to {perm.replace('can_', '').replace('_', ' ')}")

    def require_scope(self, hospitals: list[str], organ: str) -> None:
        """An action on a loop needs every one of its hospitals for that organ inside scope."""
        out = [h for h in hospitals if not self.sees(h, organ)]
        if out:
            raise HTTPException(403, f"{self.name} has no {organ} access at {', '.join(out)}")

    def public(self) -> dict:
        return {"id": self.id, "name": self.name, "role": self.role, "role_label": self.perms["label"],
                "scope": self.scope, "programs": self.programs(),
                "permissions": {k: v for k, v in self.perms.items() if k.startswith("can_")},
                "authenticated": False,
                "note": "Demo identity: there is no authentication in this prototype."}


def viewer(x_kindred_user: str | None = Header(default=None)) -> Viewer:
    """FastAPI dependency: the demo identity named in X-KindRed-User (or the default user)."""
    users = policy()["users"]
    uid = x_kindred_user or policy()["default_user"]
    if uid not in users:
        raise HTTPException(401, f"unknown demo identity {uid!r}")
    return Viewer(uid, users[uid])
