"""In-memory per-run resource locks.  Locks are released only by their owner."""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class FileLockManager:
    owners: dict[str, str] = field(default_factory=dict)

    def acquire(self, owner: str, resources: tuple[str, ...]) -> bool:
        conflict = [resource for resource in resources if resource in self.owners and self.owners[resource] != owner]
        if conflict:
            return False
        for resource in resources:
            self.owners[resource] = owner
        return True

    def release(self, owner: str) -> None:
        for resource, current_owner in tuple(self.owners.items()):
            if current_owner == owner:
                del self.owners[resource]

    def snapshot(self) -> dict[str, str]:
        return dict(sorted(self.owners.items()))
