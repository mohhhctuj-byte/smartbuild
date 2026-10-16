from __future__ import annotations

import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from server.agents.registry import AGENT_REGISTRY
from server.agents.synthetic_evaluators import (
    BugCategory,
    BugSeverity,
    BugStatus,
    EvaluatorInput,
    EvaluatorInstance,
    bug_from_finding,
    create_repair_tasks,
    deduplicate,
    evaluate,
)


class SyntheticEvaluatorTests(unittest.TestCase):
    def evaluator_input(self, root: Path, **kwargs: object) -> EvaluatorInput:
        evidence = root / "evidence" / "evaluators"
        return EvaluatorInput(
            run_id="build-synthetic-test",
            workspace_root=str(root),
            evidence_root=str(evidence),
            template="saas-landing",
            **kwargs,
        )

    def test_evaluation_without_preview_records_sequential_skips_and_keeps_registry_immutable(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            result = evaluate(self.evaluator_input(root))
            self.assertEqual(70, len(AGENT_REGISTRY))
            self.assertEqual(["functional_synthetic_user", "visual_synthetic_user"], [item.evaluator_instance.value for item in result.runs])
            self.assertEqual(["SKIPPED", "SKIPPED"], [item.status for item in result.runs])
            self.assertEqual("PASS", result.final_status)
            self.assertTrue(result.checkpoint_allowed)
            self.assertTrue((root / "evidence" / "evaluators" / "synthetic-evaluation.json").exists())

    def test_finding_without_evidence_is_unconfirmed_and_cannot_block_checkpoint(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            input_value = self.evaluator_input(root)
            bug = bug_from_finding(input_value, EvaluatorInstance.FUNCTIONAL, {
                "category": "api", "title": "Suspicion only", "severity": "critical", "actualResult": "token=secret-value",
            })
            self.assertEqual(BugStatus.UNCONFIRMED, bug.status)
            self.assertEqual(BugSeverity.UNCONFIRMED, bug.severity)
            self.assertIn("[REDACTED]", bug.actual_result)
            self.assertEqual([], create_repair_tasks([bug]))

    def test_confirmed_api_finding_maps_to_existing_agent_and_creates_locked_repair_task(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            input_value = self.evaluator_input(root)
            bug = bug_from_finding(input_value, EvaluatorInstance.FUNCTIONAL, {
                "category": "api", "title": "Invalid API contract", "severity": "high", "actualResult": "HTTP 500 for invalid input",
                "evidencePaths": ["evidence/evaluators/functional-findings.json"], "tracePath": "evidence/evaluators/functional-trace.zip",
            })
            repairs = create_repair_tasks([bug])
            self.assertEqual(BugStatus.REPAIR_PLANNED, bug.status)
            self.assertEqual("agent_022", bug.suspected_owner_agent)
            self.assertEqual(1, len(repairs))
            self.assertEqual("agent_022", repairs[0].agent_id)
            self.assertEqual(f"taskgraph:repair:{bug.bug_id}", repairs[0].task_graph_node_id)
            self.assertEqual([f"evaluator-evidence:{bug.bug_id}"], repairs[0].depends_on)
            self.assertEqual("sequential", repairs[0].execution_policy)
            self.assertIn("project-write", repairs[0].resource_locks)
            self.assertIn(repairs[0].agent_id, AGENT_REGISTRY)

    def test_duplicate_findings_are_marked_without_creating_a_second_repair_path(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            input_value = self.evaluator_input(root)
            finding = {
                "category": BugCategory.RESPONSIVE.value, "title": "Mobile overflow", "severity": "high", "actualResult": "scrollWidth exceeds viewport",
                "selectorOrTarget": "document.documentElement", "evidencePaths": ["evidence/evaluators/visual-findings.json"],
            }
            bugs = deduplicate([bug_from_finding(input_value, EvaluatorInstance.VISUAL, finding), bug_from_finding(input_value, EvaluatorInstance.VISUAL, finding)])
            self.assertEqual(BugStatus.NEW, bugs[0].status)
            self.assertEqual(BugStatus.DUPLICATE, bugs[1].status)
            self.assertEqual(1, len(create_repair_tasks(bugs)))


if __name__ == "__main__":
    unittest.main()
