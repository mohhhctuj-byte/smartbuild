from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import tempfile
import unittest

from runtime import (
    AgentRegistry,
    AgentRuntime,
    ProviderBlocked,
    RunCancelled,
    SPECIALIST_REGISTRY,
    SupervisorDenied,
    UnsafePath,
    WorkspacePathGuard,
)


@dataclass
class FakeManusProvider:
    name: str = "manus"
    calls: int = 0

    def complete(self, *, system: str, user: str, reasoning: str = "medium") -> str:
        self.calls += 1
        return "bounded Manus result"


class RuntimeTests(unittest.TestCase):
    def test_registry_contains_exactly_seventy_agents(self) -> None:
        self.assertEqual(len(SPECIALIST_REGISTRY), 70)
        self.assertEqual(len({agent.agent_id for agent in SPECIALIST_REGISTRY.values()}), 70)

    def test_supervisor_reason_and_task_gate_are_required(self) -> None:
        registry = AgentRegistry()
        with self.assertRaises(SupervisorDenied):
            registry.assign(agent_id="frontend.layout", task_kind="generate", reason="", paths=("client/src/App.tsx",))
        with self.assertRaises(SupervisorDenied):
            registry.assign(agent_id="quality.typecheck", task_kind="generate", reason="not allowed")

    def test_builder_requires_attributed_safe_paths(self) -> None:
        registry = AgentRegistry()
        assignment = registry.assign(
            agent_id="frontend.layout",
            task_kind="generate",
            reason="Supervisor assigned the layout slice.",
            paths=("client/src/App.tsx", "client/src/App.tsx"),
        )
        self.assertEqual(assignment.paths, ("client/src/App.tsx",))
        with self.assertRaises(SupervisorDenied):
            registry.assign(agent_id="frontend.layout", task_kind="generate", reason="missing paths")

    def test_path_guard_rejects_absolute_and_traversal_paths(self) -> None:
        with tempfile.TemporaryDirectory() as root:
            guard = WorkspacePathGuard(root)
            self.assertEqual(guard.resolve_many(("client/src/App.tsx",))[0].parent.name, "src")
            with self.assertRaises(UnsafePath):
                guard.resolve_many(("../outside.txt",))
            with self.assertRaises(UnsafePath):
                guard.resolve_many(("/etc/passwd",))

    def test_runtime_uses_manus_provider_and_records_events(self) -> None:
        with tempfile.TemporaryDirectory() as root:
            provider = FakeManusProvider()
            runtime = AgentRuntime(root, provider=provider)
            assignment = runtime.registry.assign(
                agent_id="frontend.layout",
                task_kind="generate",
                reason="Build the assigned UI files.",
                paths=("client/src/App.tsx",),
            )
            result = runtime.run(assignment, prompt="Create the layout.", system="You are Veyra builder.")
            self.assertEqual(result, "bounded Manus result")
            self.assertEqual(provider.calls, 1)
            self.assertEqual([event.event_type for event in runtime.events], ["agent.started", "agent.completed"])
            self.assertEqual(runtime.events[0].payload["provider"], "manus")

    def test_runtime_cancellation_is_observed_before_provider_call(self) -> None:
        with tempfile.TemporaryDirectory() as root:
            provider = FakeManusProvider()
            runtime = AgentRuntime(root, provider=provider)
            assignment = runtime.registry.assign(
                agent_id="quality.typecheck",
                task_kind="test",
                reason="Run the fixed QA check.",
            )
            runtime.cancel(assignment.run_id)
            with self.assertRaises(RunCancelled):
                runtime.run(assignment, prompt="Run QA.", system="You are Veyra QA.")
            self.assertEqual(provider.calls, 0)

    def test_missing_manus_configuration_is_blocked(self) -> None:
        # The production provider must fail closed; no fallback provider is allowed.
        provider = __import__("runtime").OpenAICompatibleManusProvider()
        old_key = __import__("os").environ.pop("OPENAI_API_KEY", None)
        old_base = __import__("os").environ.pop("OPENAI_API_BASE", None)
        try:
            with self.assertRaises(ProviderBlocked):
                provider.complete(system="system", user="user")
        finally:
            if old_key is not None:
                __import__("os").environ["OPENAI_API_KEY"] = old_key
            if old_base is not None:
                __import__("os").environ["OPENAI_API_BASE"] = old_base


if __name__ == "__main__":
    unittest.main()
