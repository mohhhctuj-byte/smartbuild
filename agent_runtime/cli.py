"""JSONL bridge entrypoint for the local desktop runtime.

The process accepts one request per line and emits one response per line. It is
intended to be launched only by the Veyra desktop/server bridge, never as a
background autonomous worker.
"""
from __future__ import annotations

import json
import os
import sys

try:
    from .runtime import AgentDefinition, AgentRegistry, AgentRuntime, ProviderBlocked, RuntimeErrorBase
    from .agents.registry import create_agent
    from .protocol import CognitiveProtocol
except ImportError:  # pragma: no cover - direct CLI execution
    from runtime import AgentDefinition, AgentRegistry, AgentRuntime, ProviderBlocked, RuntimeErrorBase
    from agents.registry import create_agent
    from protocol import CognitiveProtocol


def handle(request: dict) -> dict:
    if request.get("type") != "run_agent":
        return {"ok": False, "error": "UNSUPPORTED_REQUEST"}
    root = request.get("workspaceRoot")
    assignment = request.get("assignment") or {}
    if not isinstance(root, str) or not root.strip():
        return {"ok": False, "error": "WORKSPACE_ROOT_REQUIRED"}
    try:
        specialist = create_agent(str(assignment.get("agentId", "")))
    except KeyError as exc:
        return {"ok": False, "error": str(exc)}
    agent_id = str(assignment.get("agentId", ""))
    task_kind = str(assignment.get("taskKind", ""))
    definition = AgentDefinition(
        agent_id=agent_id,
        label=str(getattr(specialist, "name", agent_id)),
        category=str(getattr(specialist, "team", "specialist")),
        capabilities=tuple(getattr(specialist, "capabilities", ())),
        allowed_task_kinds=(task_kind,),
        requires_file_attribution=bool(getattr(specialist, "required_tools", ())) and bool(assignment.get("paths")),
    )
    runtime = AgentRuntime(root, registry=AgentRegistry({agent_id: definition}))
    protocol = CognitiveProtocol()
    contract = protocol.build_requirement_contract(
        user_goal=str(request.get("userGoal") or "Execute the supervisor-approved specialist task"),
        requested_features=tuple(str(item) for item in request.get("requestedFeatures", ()) if str(item).strip()),
        constraints=("Manus provider only", "No autonomous execution", "Canonical workspace paths only"),
        acceptance_criteria=("Return bounded specialist result and auditable runtime evidence",),
        non_goals=("Do not expose private reasoning or secrets",),
    )
    try:
        assigned = runtime.registry.assign(
            agent_id=agent_id,
            task_kind=task_kind,
            reason=str(assignment.get("reason", "")),
            paths=assignment.get("paths", []),
        )
        result = runtime.run(
            assigned,
            prompt=str(request.get("prompt", "")),
            system=str(request.get("system", "You are a bounded Veyra specialist.")),
        )
        criterion = protocol.create_acceptance_criteria((("Return bounded specialist result and auditable runtime evidence", "agent completion event and provider response"),))[0]
        protocol.collect_evidence(kind="log", summary="Specialist runtime completed with bounded event evidence", source="agent.runtime.completed", criterion_id=criterion.criterion_id, passed=True)
        verification = protocol.verify(confidence="medium")
        return {"ok": True, "runId": assigned.run_id, "agentId": assigned.agent_id, "result": result, "specialist": specialist.explain(), "events": json.loads(runtime.export_events()), "protocol": {"contractId": contract.contract_id, "verification": verification.model_dump(mode="json"), "status": protocol.generate_user_facing_status(verification)}}
    except ProviderBlocked as exc:
        protocol.collect_evidence(kind="log", summary="Manus provider is not configured for this runtime session", source="provider.readiness", passed=False)
        verification = protocol.verify(confidence="high")
        return {"ok": False, "error": str(exc), "providerStatus": "BLOCKED", "protocol": {"contractId": contract.contract_id, "verification": verification.model_dump(mode="json"), "status": protocol.generate_user_facing_status(verification)}}
    except RuntimeErrorBase as exc:
        protocol.collect_evidence(kind="log", summary="Specialist runtime request was blocked by a runtime guard", source="runtime.guard", passed=False)
        verification = protocol.verify(confidence="high")
        return {"ok": False, "error": str(exc), "protocol": {"contractId": contract.contract_id, "verification": verification.model_dump(mode="json"), "status": protocol.generate_user_facing_status(verification)}}


def main() -> int:
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            response = handle(json.loads(line))
        except (json.JSONDecodeError, TypeError):
            response = {"ok": False, "error": "INVALID_JSON"}
        sys.stdout.write(json.dumps(response, sort_keys=True) + "\n")
        sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
