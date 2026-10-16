from __future__ import annotations

import asyncio
import unittest

from agents.registry import AGENT_CLASSES, create_agent
from base_agent import BaseAgent
from schemas import AgentContext, AgentResult, AgentStatus, TaskSpec
from orchestration import TaskExecutor, TaskGraph
from memory import ProjectMemory
from supervisor import Supervisor
from schemas import ExecutionPolicy
from cli import handle


class FlakyAgent(BaseAgent):
    agent_id = "test.flaky"
    name = "Flaky Test Agent"
    description = "Fails once for retry verification."
    team = "test"

    def __init__(self) -> None:
        self.calls = 0

    async def run(self, context: AgentContext, task: TaskSpec) -> AgentResult:
        self.calls += 1
        if self.calls < 2:
            raise RuntimeError("transient failure")
        return AgentResult(status=AgentStatus.COMPLETED, agent_id=self.agent_id, run_id=context.run_id, summary="recovered")


class ContractTests(unittest.TestCase):
    def test_exact_named_registry_has_seventy_modules(self) -> None:
        self.assertEqual(len(AGENT_CLASSES), 70)
        self.assertEqual(len({agent_id for agent_id in AGENT_CLASSES}), 70)
        self.assertEqual(create_agent("user_clarifier").name, "User Clarifier Agent")

    def test_dry_run_completes_without_fake_external_work(self) -> None:
        agent = create_agent("user_clarifier")
        result = asyncio.run(agent.run(
            AgentContext(run_id="run-1", workspace_root="/tmp", supervisor_reason="clarify", dry_run=True),
            TaskSpec(task_id="t1", agent_id="user_clarifier", title="Clarify", dry_run=True),
        ))
        self.assertEqual(result.status, AgentStatus.COMPLETED)
        self.assertIn("Dry run", result.summary)

    def test_default_agent_is_blocked_without_scoped_adapter(self) -> None:
        agent = create_agent("user_clarifier")
        result = asyncio.run(agent.run(
            AgentContext(run_id="run-2", workspace_root="/tmp", supervisor_reason="clarify"),
            TaskSpec(task_id="t1", agent_id="user_clarifier", title="Clarify"),
        ))
        self.assertEqual(result.status, AgentStatus.BLOCKED)
        self.assertEqual(result.blocked_reason, "SPECIALIST_TOOL_ADAPTER_REQUIRED")

    def test_executor_respects_dependency_order(self) -> None:
        graph = TaskGraph((
            TaskSpec(task_id="a", agent_id="user_clarifier", title="A", dry_run=True),
            TaskSpec(task_id="b", agent_id="intent_verifier", title="B", dependencies=("a",), dry_run=True),
        ))
        executor = TaskExecutor({"user_clarifier": create_agent("user_clarifier"), "intent_verifier": create_agent("intent_verifier")}, policy=ExecutionPolicy(dry_run=True))
        results = asyncio.run(executor.execute(graph, AgentContext(run_id="run-3", workspace_root="/tmp", supervisor_reason="plan")))
        self.assertEqual(set(results), {"a", "b"})
        self.assertTrue(all(result.status == AgentStatus.COMPLETED for result in results.values()))

    def test_supervisor_selects_a_subset_instead_of_all_agents(self) -> None:
        context, graph = Supervisor().plan("Build a responsive frontend page", workspace_root="/tmp")
        self.assertEqual(context.supervisor_reason, "Supervisor selected 2 specialist(s) for the request.")
        self.assertEqual(len(graph.tasks), 2)
        self.assertLess(len(graph.tasks), 70)

    def test_memory_rejects_secret_material(self) -> None:
        import tempfile
        with tempfile.TemporaryDirectory() as root:
            memory = ProjectMemory(f"{root}/memory.sqlite")
            with self.assertRaises(ValueError):
                memory.append("decision", {"api_key": "must-not-persist"}, 1)
            memory.append("decision", {"summary": "use Manus provider"}, 2)
            self.assertEqual(memory.list()[0]["payload"]["summary"], "use Manus provider")
            memory.close()

    def test_jsonl_cli_rejects_unknown_specialist(self) -> None:
        response = handle({"type": "run_agent", "workspaceRoot": "/tmp", "assignment": {"agentId": "missing-agent"}})
        self.assertFalse(response["ok"])
        self.assertIn("SPECIALIST_NOT_REGISTERED", response["error"])

    def test_executor_retries_transient_failure(self) -> None:
        agent = FlakyAgent()
        graph = TaskGraph((TaskSpec(task_id="retry", agent_id=agent.agent_id, title="Retry", dry_run=False),))
        executor = TaskExecutor({agent.agent_id: agent}, policy=ExecutionPolicy(max_retries=1))
        results = asyncio.run(executor.execute(graph, AgentContext(run_id="run-retry", workspace_root="/tmp", supervisor_reason="retry")))
        self.assertEqual(results["retry"].status, AgentStatus.COMPLETED)
        self.assertEqual(agent.calls, 2)
        self.assertTrue(any(event.event_type == "task.retrying" for event in executor.events.events))

    def test_executor_returns_failed_after_retries_exhausted(self) -> None:
        agent = FlakyAgent()
        graph = TaskGraph((TaskSpec(task_id="retry", agent_id=agent.agent_id, title="Retry"),))
        executor = TaskExecutor({agent.agent_id: agent}, policy=ExecutionPolicy(max_retries=0))
        results = asyncio.run(executor.execute(graph, AgentContext(run_id="run-fail", workspace_root="/tmp", supervisor_reason="retry")))
        self.assertEqual(results["retry"].status, AgentStatus.FAILED)
        self.assertEqual(agent.calls, 1)

    def test_executor_blocks_high_risk_without_approval(self) -> None:
        graph = TaskGraph((TaskSpec(task_id="r", agent_id="system_environment_installer", title="Install", high_risk=True),))
        executor = TaskExecutor({"system_environment_installer": create_agent("system_environment_installer")})
        results = asyncio.run(executor.execute(graph, AgentContext(run_id="run-4", workspace_root="/tmp", supervisor_reason="install")))
        self.assertEqual(results["r"].status, AgentStatus.BLOCKED)
        self.assertEqual(results["r"].blocked_reason, "APPROVAL_REQUIRED")


if __name__ == "__main__":
    unittest.main()
