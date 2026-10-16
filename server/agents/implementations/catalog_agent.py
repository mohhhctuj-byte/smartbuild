"""Request-scoped implementation for the explicit additive agent modules.

Every generated module declares one immutable source responsibility.  The shared
implementation below turns that responsibility into a bounded, reviewable work
product inside the selected Build Run.  It deliberately has no network,
deployment, credential, payment, account, or provider side effects.
"""
from __future__ import annotations

import hashlib
import json
import re

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..execution_support import agent_evidence, blocked, request_title, write_project_file


class CatalogResponsibilityAgent(SpecialistAgent):
    """A source-role implementation that emits a type-specific scoped work product."""

    source_id: str
    source_name: str
    source_mission: str
    source_output: str
    source_tools: str
    source_team: str

    _REDACTED_TERMS = {
        "secret", "password", "passwd", "token", "api", "key", "otp", "cookie",
        "authorization", "bearer", "smtp", "resend", "credential",
    }

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        if context.metadata.get("evidence_only"):
            return blocked(self, context, task, self.source_mission, "EVIDENCE_ONLY_MODE_DISALLOWS_ARTIFACT_WRITE")
        if not context.project_id or not context.conversation_id or not context.run_id or not context.workspace_root:
            return blocked(self, context, task, self.source_mission, "REQUEST_SCOPED_BUILD_CONTEXT_REQUIRED")

        normalized_request = " ".join(context.request.split())
        if not normalized_request:
            return blocked(self, context, task, self.source_mission, "REQUEST_CONTENT_REQUIRED")

        request_fingerprint = hashlib.sha256(normalized_request.encode("utf-8")).hexdigest()[:16]
        content = self._deliverable(context, task, request_fingerprint)
        try:
            written_report = write_project_file(context, task, self._artifact_path(task.task_id), content)
            written_manifest = write_project_file(
                context,
                task,
                self._manifest_path(task.task_id),
                self._manifest(context, task, request_fingerprint),
            )
        except RuntimeError as exc:
            return blocked(self, context, task, self.source_mission, str(exc))

        findings = (
            f"Produced `{self.source_output}` for source role {self.source_id} from the selected request signals.",
            f"Request fingerprint: sha256:{request_fingerprint}.",
            f"Applied bounded {self.source_team} review steps; no provider, credential, deployment, or external side effect occurred.",
        )
        return agent_evidence(
            self,
            context,
            task,
            responsibility=self.source_mission,
            findings=findings,
            changed_files=(written_report, written_manifest),
        )

    def _artifact_path(self, task_id: str) -> str:
        safe_source = re.sub(r"[^a-z0-9]+", "-", self.source_id.lower()).strip("-")
        safe_task = re.sub(r"[^a-zA-Z0-9_-]+", "_", task_id).strip("_")
        return f"agent-artifacts/{safe_source}/{safe_task}.md"

    def _manifest_path(self, task_id: str) -> str:
        return self._artifact_path(task_id).removesuffix(".md") + ".work-product.json"

    def _safe_topics(self, request: str) -> tuple[str, ...]:
        tokens = re.findall(r"[A-Za-z][A-Za-z0-9_-]{2,}|[\u0621-\u064A]{3,}", request.lower())
        kept: list[str] = []
        for token in tokens:
            if token in self._REDACTED_TERMS or token in kept:
                continue
            kept.append(token)
            if len(kept) == 8:
                break
        return tuple(kept) or ("request",)

    def _team_sections(self, topics: tuple[str, ...]) -> tuple[tuple[str, str], ...]:
        topic_line = ", ".join(f"`{topic}`" for topic in topics)
        plans: dict[str, tuple[tuple[str, str], ...]] = {
            "product": (
                ("Problem framing", f"Frame the user outcome around the bounded request topics: {topic_line}."),
                ("Acceptance boundary", "State observable completion conditions and list assumptions that require confirmation."),
                ("Scope decision", "Separate the minimum usable scope from explicitly deferred or provider-dependent work."),
            ),
            "ux": (
                ("User journey", f"Map the entry, primary action, feedback, and recovery path for: {topic_line}."),
                ("Interaction states", "Identify empty, loading, validation, success, and blocked states without fabricating live results."),
                ("Accessibility review", "Specify keyboard, label, contrast, and responsive requirements for the chosen flow."),
            ),
            "frontend": (
                ("Component boundary", f"Define the smallest visible component/state change supporting: {topic_line}."),
                ("State contract", "List loading, validation, error, and success transitions that the component must expose."),
                ("Verification target", "Require a deterministic rendering or interaction assertion before acceptance."),
            ),
            "backend": (
                ("Service contract", f"Define input validation, authorized behavior, and response shape for: {topic_line}."),
                ("Failure semantics", "Distinguish invalid input, missing approval, unavailable dependency, and internal failure."),
                ("Data boundary", "Identify only the project-scoped records and transaction boundary needed by the request."),
            ),
            "data": (
                ("Model proposal", f"List entities, fields, ownership, and lifecycle needed for: {topic_line}."),
                ("Integrity controls", "Define validation, uniqueness, retention, and migration review requirements."),
                ("Query evidence", "Specify the bounded query or aggregation that later code must test."),
            ),
            "security": (
                ("Threat boundary", f"Identify assets, trust boundaries, and least-privilege concerns around: {topic_line}."),
                ("Control decision", "Require server-side authorization, input validation, redaction, and audit-friendly evidence."),
                ("Approval gate", "Block provider, credential, account, payment, or deployment actions pending explicit approval."),
            ),
            "quality": (
                ("Testable claim", f"Convert the selected request topics into an observable pass/fail claim: {topic_line}."),
                ("Negative path", "Name at least one invalid, unavailable, or cross-scope case that must not pass."),
                ("Evidence contract", "Require reproducible test output or a typed BLOCKED result; never infer success from file existence."),
            ),
            "operations": (
                ("Operational plan", f"Define the bounded readiness checks and rollback boundary for: {topic_line}."),
                ("Runtime safeguards", "Keep deployment, scheduled work, external calls, and destructive actions behind explicit approval."),
                ("Runbook evidence", "Record the command-independent evidence later operators must collect."),
            ),
            "ai": (
                ("Model task", f"Define a constrained, typed decision task relevant to: {topic_line}."),
                ("Evaluation boundary", "Describe deterministic inputs, output schema, and a failure condition before any model use."),
                ("Cost and safety", "Require server-only policy routing, bounded calls, and redacted traces."),
            ),
            "mobile": (
                ("Device flow", f"Describe the touch, viewport, offline, and permission implications for: {topic_line}."),
                ("Platform boundary", "Keep platform-specific capabilities behind explicit support checks and graceful blocked states."),
                ("Verification target", "Define one small-screen and one assistive-technology acceptance check."),
            ),
            "performance": (
                ("Performance target", f"Identify the user-visible path affected by: {topic_line}."),
                ("Measurement plan", "Define the metric, budget, baseline, and repeatable measurement boundary."),
                ("Mitigation", "Propose a scoped optimization with a regression check rather than an unmeasured claim."),
            ),
            "accessibility": (
                ("Access path", f"Review semantic structure and alternative interaction paths for: {topic_line}."),
                ("Inclusive states", "Specify focus, announcements, contrast, language, and error-recovery requirements."),
                ("Audit check", "State the manual or automated accessibility assertion required before acceptance."),
            ),
            "growth": (
                ("Audience hypothesis", f"Describe a privacy-aware value message for: {topic_line}."),
                ("Measurement boundary", "List consent, attribution, and non-fabricated evidence requirements."),
                ("Experiment guardrail", "State the reversible change and success criterion without claiming analytics occurred."),
            ),
            "communication": (
                ("Interaction outcome", f"Define the concise, non-sensitive user communication needed for: {topic_line}."),
                ("Escalation boundary", "Specify when the flow must request clarification or hand off rather than invent an answer."),
                ("Privacy guard", "Do not include account data, secrets, or external-message claims in the work product."),
            ),
            "diagnosis": (
                ("Observed condition", f"Record the reproducible symptom or question represented by: {topic_line}."),
                ("Hypothesis discipline", "Separate verified facts from assumptions and define the next bounded diagnostic check."),
                ("Resolution evidence", "Require a before/after observation or leave the issue explicitly BLOCKED."),
            ),
            "voice": (
                ("Consent-aware flow", f"Define the voice interaction intent and text fallback for: {topic_line}."),
                ("Data boundary", "Keep audio capture, retention, and transmission disabled until consent and a provider are configured."),
                ("Verification target", "Specify accessibility and fallback checks without claiming speech processing occurred."),
            ),
        }
        return plans.get(self.source_team, (
            ("Scoped objective", f"Apply {self.source_mission} to the selected request topics: {topic_line}."),
            ("Deliverable contract", f"Produce the declared `{self.source_output}` in the Build Run only."),
            ("Review gate", "Require a downstream reviewer to validate the artifact and its evidence hash before reliance."),
        ))

    def _deliverable(self, context: BuildContext, task: TaskDefinition, request_fingerprint: str) -> str:
        title = request_title(context)
        topics = self._safe_topics(context.request)
        sections = self._team_sections(topics)
        lines = [
            f"# {self.source_name} — {self.source_output}",
            "",
            f"- **Canonical agent:** `{self.spec.id}`",
            f"- **Source role:** `{self.source_id}`",
            f"- **Team:** `{self.source_team}`",
            f"- **Project title:** {title}",
            f"- **Build Run:** `{context.run_id}`",
            f"- **Task:** `{task.task_id}`",
            f"- **Request fingerprint:** `sha256:{request_fingerprint}`",
            f"- **Input topics:** {', '.join(f'`{topic}`' for topic in topics)}",
            "",
            "## Declared responsibility",
            self.source_mission,
            "",
            "## Work product",
        ]
        for heading, body in sections:
            lines.extend((f"### {heading}", body, ""))
        lines.extend((
            "## Safety and verification boundary",
            "This is a request-scoped, reviewable artifact. It does not claim an external action, provider call, security scan, deployment, payment, account change, or user-data operation occurred.",
            "The durable evidence record references this exact file and Build Run; consumers must verify its hash and selected-agent status before relying on it.",
            "",
        ))
        return "\n".join(lines)

    def _manifest(self, context: BuildContext, task: TaskDefinition, request_fingerprint: str) -> str:
        topics = self._safe_topics(context.request)
        actions = []
        for index, (heading, body) in enumerate(self._team_sections(topics), start=1):
            action_slug = re.sub(r"[^a-z0-9]+", "-", heading.lower()).strip("-")
            actions.append({
                "id": f"{self.source_id.lower()}-{index}-{action_slug}",
                "status": "proposed",
                "responsibility": heading,
                "instruction": body,
                "verification": list(task.verification_methods) or ["review-evidence-hash"],
            })
        return json.dumps({
            "format": "smartbuild-agent-work-product-v1",
            "canonicalAgentId": self.spec.id,
            "sourceRole": {
                "id": self.source_id,
                "name": self.source_name,
                "team": self.source_team,
                "mission": self.source_mission,
                "declaredOutput": self.source_output,
            },
            "buildScope": {
                "buildRunId": context.run_id,
                "projectId": context.project_id,
                "conversationId": context.conversation_id,
                "taskId": task.task_id,
                "allowedPathScopes": list(task.allowed_path_scopes),
            },
            "request": {
                "fingerprint": f"sha256:{request_fingerprint}",
                "topics": list(topics),
            },
            "actions": actions,
            "externalActions": "not-performed",
            "evidenceRequirement": "Verify the persisted file hash and selected task status before relying on this proposed work product.",
        }, indent=2, sort_keys=True) + "\n"
