"""Regression coverage for the canonical server-side 300-agent orchestrator."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from server.agents.base_agent import BaseAgent
from server.agents.file_lock_manager import FileLockManager
from server.agents.model_profiles import MODEL_PROFILES
from server.agents.registry import AGENT_REGISTRY, get_agent, list_agents
from server.agents.supervisor import EXECUTION_POLICY, Supervisor
from server.agents.agent_specs import BuildContext, TaskDefinition, TaskStatus
from server.agents.trace_store import TraceStore


class CanonicalServerAgentTests(unittest.TestCase):
    def context(self, request: str, **kwargs: object) -> BuildContext:
        return BuildContext(
            run_id=f"run_{uuid4().hex}", request=request, workspace_id="workspace_test", workspace_root="generated-project",
            granted_tool_scopes=("workspace.read", "workspace.write"), dry_run=True, **kwargs,
        )

    def test_registry_has_exactly_300_contiguous_unique_real_agents(self) -> None:
        self.assertEqual(300, len(AGENT_REGISTRY))
        self.assertEqual([f"agent_{value:03d}" for value in range(1, 301)], list(AGENT_REGISTRY))
        self.assertEqual(300, len({agent.spec.name for agent in list_agents()}))
        self.assertEqual(300, len({agent.__class__.__name__ for agent in list_agents()}))
        self.assertTrue(all(isinstance(agent, BaseAgent) for agent in list_agents()))
        self.assertTrue(all(callable(agent.can_run) and callable(agent.run) and callable(agent.verify) for agent in list_agents()))

    def test_model_profiles_do_not_create_agents(self) -> None:
        self.assertEqual({"deep_reasoning", "precise_coding", "web_research", "vision_understanding", "adversarial_review"}, set(MODEL_PROFILES))
        self.assertEqual(300, len(AGENT_REGISTRY))

    def test_static_saas_is_selective_and_excludes_unrelated_agents(self) -> None:
        plan = Supervisor().plan(self.context("Build a responsive SaaS landing page with accessible UI."))
        selected = {agent.id for agent in plan.selected_agents}
        self.assertIn("agent_003", selected)
        self.assertIn("agent_005", selected)
        self.assertIn("agent_029", selected)
        self.assertIn("agent_033", selected)
        self.assertIn("agent_009", selected)
        self.assertNotIn("agent_038", selected)
        self.assertNotIn("agent_057", selected)
        self.assertNotIn("agent_059", selected)
        self.assertLess(len(selected), 15)
        self.assertEqual(1, EXECUTION_POLICY["max_concurrency"])

    def test_contact_backend_route_selects_required_chain_and_executes_sequentially(self) -> None:
        with TemporaryDirectory() as directory:
            supervisor = Supervisor(TraceStore(Path(directory)))
            context = self.context("Build a contact page with real validation, a backend POST endpoint, SQLite persistence, and executable Playwright tests.")
            plan = supervisor.plan(context)
            selected = {agent.id for agent in plan.selected_agents}
            required = {"agent_003", "agent_006", "agent_007", "agent_019", "agent_022", "agent_023", "agent_024", "agent_045", "agent_046", "agent_051", "agent_009", "agent_069"}
            self.assertTrue(required.issubset(selected))
            result = supervisor.execute(context, plan)
            self.assertTrue(result.checkpoint_allowed)
            self.assertEqual("PASS", result.graph.nodes[f"{context.run_id}:checkpoint"].status.value)
            self.assertTrue(result.trace_path)
            self.assertGreaterEqual(len(supervisor.trace_store.list(context.run_id)), len(selected))

    def test_production_outputs_are_request_specific_and_tuple_isolated(self) -> None:
        requests = (
            ("maya-run", 1001, 2001, "Build Maya Noor Portfolio", "portfolio-request-secret"),
            ("bella-run", 1002, 2002, "Build Bella Tavola Restaurant", "restaurant-request-secret"),
        )
        outputs: list[tuple[str, str, str, str]] = []
        agent = get_agent("agent_005")
        self.assertIsNotNone(agent)
        task = lambda run_id: TaskDefinition(
            task_id=f"{run_id}:agent_005", agent_id="agent_005", title="Implement scoped interface",
            purpose="Write the request-specific interface shell.", allowed_tool_scopes=("workspace.read", "workspace.write"),
            allowed_path_scopes=("project/**", "agent-artifacts/**"), verification_methods=("structured-evidence",),
            selected_reason="REQUEST_CAPABILITY_MATCH",
        )
        with TemporaryDirectory() as root:
            for run_id, project_id, conversation_id, title, raw_marker in requests:
                workspace = Path(root) / run_id
                workspace.mkdir()
                context = BuildContext(
                    run_id=run_id, request=f"{title}; private marker {raw_marker}", workspace_id=f"workspace-{project_id}",
                    workspace_root=str(workspace), project_id=project_id, conversation_id=conversation_id,
                    granted_tool_scopes=("workspace.read", "workspace.write"), dry_run=False,
                    metadata={"project_title": title},
                )
                execution, trace = agent.run(context, task(run_id))  # type: ignore[union-attr]
                self.assertEqual(TaskStatus.SUCCEEDED, execution.status)
                self.assertEqual(run_id, trace.run_id)
                self.assertEqual(project_id, context.project_id)
                self.assertTrue((workspace / "index.html").read_text(encoding="utf-8").strip())
                self.assertTrue((workspace / "app.js").read_text(encoding="utf-8").strip())
                report = next(workspace.glob("agent-artifacts/original/agent_005/*.md")).read_text(encoding="utf-8")
                evidence = next(workspace.glob("evidence/agent-executions/*.json")).read_text(encoding="utf-8")
                self.assertIn(title, (workspace / "index.html").read_text(encoding="utf-8"))
                self.assertNotIn(raw_marker, report)
                self.assertNotIn(raw_marker, evidence)
                outputs.append((run_id, str(project_id), (workspace / "index.html").read_text(encoding="utf-8"), report))
        self.assertNotEqual(outputs[0][2], outputs[1][2])
        self.assertNotEqual(outputs[0][3], outputs[1][3])
        self.assertEqual({"maya-run", "bella-run"}, {item[0] for item in outputs})
        self.assertEqual({"1001", "1002"}, {item[1] for item in outputs})

    def test_secret_gate_blocks_and_no_checkpoint_is_created(self) -> None:
        context = self.context("Build a payment checkout with Stripe API key.")
        result = Supervisor().execute(context)
        self.assertFalse(result.checkpoint_allowed)
        self.assertEqual("BLOCKED", result.graph.nodes[f"{context.run_id}:checkpoint"].status.value)
        self.assertTrue(any(row.status == "BLOCKED" for row in result.acceptance_rows))

    def test_file_lock_conflict_is_prevented(self) -> None:
        locks = FileLockManager()
        self.assertTrue(locks.acquire("task-a", ("db-migration",)))
        self.assertFalse(locks.acquire("task-b", ("db-migration",)))
        locks.release("task-a")
        self.assertTrue(locks.acquire("task-b", ("db-migration",)))

    def test_clarification_gate_prevents_checkpoint(self) -> None:
        context = self.context("Build")
        result = Supervisor().execute(context)
        self.assertFalse(result.checkpoint_allowed)
        self.assertEqual("NEEDS_USER_INPUT", result.graph.nodes[f"{context.run_id}:agent_001"].status.value)


if __name__ == "__main__":
    unittest.main()
