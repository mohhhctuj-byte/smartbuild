import unittest

try:
    from agent_runtime.protocol import CognitiveProtocol
except ModuleNotFoundError:  # pragma: no cover - direct test execution
    from protocol import CognitiveProtocol


class CognitiveProtocolTests(unittest.TestCase):
    def test_requirement_assumptions_and_evidence_verify(self):
        protocol = CognitiveProtocol()
        contract = protocol.build_requirement_contract(
            user_goal="Build a verified landing page",
            requested_features=("hero", "contact form"),
            acceptance_criteria=("form submits",),
        )
        assumption = protocol.record_assumption(
            statement="The project uses the existing React app",
            reason="The current workspace already contains the React entrypoint",
        )
        criterion = protocol.create_acceptance_criteria((("Form submits", "HTTP integration test"),))[0]
        evidence = protocol.collect_evidence(
            kind="test",
            summary="HTTP integration test passed",
            source="vitest:contact-form",
            criterion_id=criterion.criterion_id,
            passed=True,
        )
        report = protocol.verify(confidence="high")
        self.assertEqual(report.status, "verified")
        self.assertEqual(contract.user_goal, "Build a verified landing page")
        self.assertEqual(assumption.impact, "low")
        self.assertTrue(evidence.passed)

    def test_missing_evidence_is_not_verified(self):
        protocol = CognitiveProtocol()
        protocol.create_acceptance_criteria((("Deploy", "deployment record"),))
        report = protocol.verify()
        self.assertEqual(report.status, "incomplete")
        self.assertEqual(report.blocked_reason, "ACCEPTANCE_EVIDENCE_MISSING")

    def test_provider_or_desktop_blocker_can_be_user_facing(self):
        protocol = CognitiveProtocol()
        protocol.record_assumption(
            statement="Desktop folder binding is unavailable in Web Preview",
            reason="No device bridge is connected",
            impact="high",
            requires_confirmation=True,
        )
        evidence = protocol.collect_evidence(
            kind="http",
            summary="Agent route returned Desktop bridge required",
            source="POST /api/local/agents/run",
            passed=False,
        )
        report = protocol.verify()
        status = protocol.generate_user_facing_status(report)
        self.assertEqual(report.status, "blocked")
        self.assertEqual(report.blocked_reason, "EVIDENCE_FAILED_OR_CONFIGURATION_BLOCKED")
        self.assertEqual(status["confidence"], "medium")
        self.assertFalse(status["private_reasoning_included"])
        self.assertEqual(status["assumptions"], ["Desktop folder binding is unavailable in Web Preview"])
        self.assertFalse(evidence.passed)

    def test_private_reasoning_and_secret_fields_are_rejected(self):
        protocol = CognitiveProtocol()
        with self.assertRaises(ValueError):
            protocol.build_requirement_contract(user_goal="private_reasoning: hidden chain")
        with self.assertRaises(ValueError):
            protocol.collect_evidence(kind="log", summary="api_key: leaked", source="test", passed=False)

    def test_recovery_state_is_concise_and_safe(self):
        protocol = CognitiveProtocol()
        recovery = protocol.recover_from_checkpoint(
            checkpoint_id="checkpoint-1",
            completed_artifacts=("client/src/App.tsx",),
            pending_tasks=("Run QA",),
        )
        self.assertTrue(recovery.safe_to_resume)
        self.assertEqual(recovery.next_action, "Run QA")


if __name__ == "__main__":
    unittest.main()
