from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from .agent_specs import BuildContext, TaskDefinition, TaskStatus
from .registry import ADDITIVE_CATALOG, get_agent


class AdditiveAgentExecutionTests(unittest.TestCase):
    def test_all_additive_bindings_emit_scoped_typed_work_products(self) -> None:
        self.assertEqual(len(ADDITIVE_CATALOG), 230)
        request = "Build a request-specific portfolio dashboard with secure validation and responsive layout"
        with tempfile.TemporaryDirectory(prefix="smartbuild-additive-") as directory:
            root = Path(directory)
            context = BuildContext(
                run_id="run-additive-regression",
                request=request,
                workspace_id="project-7000001",
                workspace_root=str(root),
                project_id=7000001,
                conversation_id=6500001,
                granted_tool_scopes=("workspace.read", "workspace.write"),
                dry_run=False,
            )
            changed: list[str] = []
            source_roles: set[str] = set()
            fingerprints: set[str] = set()
            for index, row in enumerate(ADDITIVE_CATALOG, start=71):
                agent_id = str(row["id"])
                agent = get_agent(agent_id)
                task = TaskDefinition(
                    task_id=f"production:{index:03d}:{agent_id}",
                    agent_id=agent_id,
                    title=str(row["name"]),
                    purpose=str(row["role"]),
                    status=TaskStatus.PLANNED,
                    inputs=("RequirementContract", "BuildContext", "ScopedTask"),
                    outputs=(str(row["output"]),),
                    allowed_tool_scopes=("workspace.read", "workspace.write"),
                    allowed_path_scopes=("agent-artifacts/**",),
                    resource_locks=("project-write",),
                    verification_methods=("structured-evidence", "request-fingerprint", "scoped-artifact-exists"),
                    selected_reason="REQUEST_CAPABILITY_MATCH",
                )
                execution, trace = agent.run(context, task)
                self.assertEqual(execution.status, TaskStatus.SUCCEEDED, agent_id)
                self.assertEqual(trace.event, "agent.succeeded", agent_id)
                self.assertEqual(trace.run_id, context.run_id)
                self.assertEqual(trace.agent_id, agent_id)
                self.assertTrue(execution.evidence_refs, agent_id)
                self.assertGreaterEqual(len(execution.produced_artifacts), 2, agent_id)
                for relative in execution.produced_artifacts:
                    self.assertTrue(relative.startswith("agent-artifacts/"), relative)
                    file_path = root / relative
                    self.assertTrue(file_path.is_file(), relative)
                    content = file_path.read_text(encoding="utf-8")
                    self.assertTrue(content.strip(), relative)
                    self.assertNotRegex(content.lower(), r"secret\s*[:=]|password\s*[:=]|passwd\s*[:=]|\botp\s*[:=]|cookie\s*[:=]|bearer\s+ey|smtp\s*[:=]|resend\s*[:=]|api[_ -]?key\s*[:=]")
                    changed.append(relative)
                report_path = root / execution.produced_artifacts[0]
                report = report_path.read_text(encoding="utf-8")
                self.assertIn(str(row["source_id"]), report)
                self.assertIn(agent_id, report)
                manifest = json.loads((root / execution.produced_artifacts[1]).read_text(encoding="utf-8"))
                self.assertEqual(manifest["canonicalAgentId"], agent_id)
                self.assertEqual(manifest["buildScope"]["projectId"], context.project_id)
                self.assertEqual(manifest["buildScope"]["conversationId"], context.conversation_id)
                source_roles.add(str(row["source_id"]))
                fingerprints.add(str(manifest["request"]["fingerprint"]))
            self.assertEqual(len(changed), 460)
            self.assertEqual(len(set(changed)), 460)
            self.assertEqual(len(source_roles), 230)
            self.assertEqual(len(fingerprints), 1)


if __name__ == "__main__":
    unittest.main()
