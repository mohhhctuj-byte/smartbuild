from __future__ import annotations

from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs" / "agents"
MODULES = ROOT / "agent_runtime" / "agents"
MANIFEST = DOCS / "manifest.json"
required_sections = ("## Supervisor activation", "## Inputs and outputs", "## Dependencies and permissions", "## Blocked conditions and validation", "## Concrete website-building example")
manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
docs = sorted(DOCS.glob("*.md"))
modules = sorted(path for path in MODULES.glob("*.py") if path.name not in {"__init__.py", "registry.py"})
assert len(manifest) == 70, len(manifest)
assert len(docs) == 70, len(docs)
assert len(modules) == 70, len(modules)
examples = set()
for doc in docs:
    agent_id = doc.stem
    profile = manifest[agent_id]
    text = doc.read_text(encoding="utf-8")
    assert f"`{agent_id}`" in text, agent_id
    assert f"**Team:** `{profile['team']}`" in text, agent_id
    for section in required_sections:
        assert section in text, f"{agent_id}:{section}"
    expected_tools = ", ".join(profile["tools"])
    expected_permissions = ", ".join(profile["permissions"])
    expected_dependencies = ", ".join(profile["dependencies"]) if profile["dependencies"] else "none beyond Supervisor assignment"
    assert f"**Tools:** {expected_tools}." in text, agent_id
    assert f"**Permissions:** {expected_permissions}." in text, agent_id
    assert f"**Dependencies:** {expected_dependencies}." in text, agent_id
    assert profile["blocked_code"] in text, agent_id
    assert profile["validation"] in text, agent_id
    assert profile["example"] in text, agent_id
    assert profile["example"] not in examples, f"DUPLICATE_EXAMPLE:{agent_id}"
    examples.add(profile["example"])
    assert "no implicit permissions" not in text.lower(), agent_id
    assert re.search(r"For a Veyra website request, .+ uses [a-z0-9_.-]+ to .+ records role-specific evidence", text), agent_id
print(f"agent-docs-ok {len(docs)} docs, {len(modules)} modules, {len(examples)} unique examples")
