"""JSON-only entrypoint for the server-owned canonical SmartBuild supervisor."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .agent_specs import BuildContext
from .registry import AGENT_REGISTRY, get_agent
from .supervisor import EXECUTION_POLICY, Supervisor
from .trace_store import TraceStore


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run a selected SmartBuild agent orchestration plan.")
    parser.add_argument("--request", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--workspace-id", required=True)
    parser.add_argument("--workspace-root", required=True)
    parser.add_argument("--trace-root", required=True)
    parser.add_argument("--project-id", type=int)
    parser.add_argument("--conversation-id", type=int)
    parser.add_argument("--mode", choices=("plan", "dry-run", "production"), default="plan")
    parser.add_argument("--agent-id")
    parser.add_argument("--evidence-only", action="store_true")
    return parser


def _public_plan(plan: object) -> dict[str, object]:
    # Kept here instead of serializing dataclasses wholesale to avoid accidental path/secret exposure.
    return {
        "runId": plan.run_id,
        "executionMode": "selection-only",
        "selectedAgents": [{"id": item.id, "name": item.name, "team": item.team, "role": item.role, "modelProfile": item.model_profile, "selected": True} for item in plan.selected_agents],
        "skippedAgents": [{"id": agent_id, "reason": reason} for agent_id, reason in plan.skipped_agents],
        "tasks": [{"taskId": item.task_id, "agentId": item.agent_id, "title": item.title, "dependsOn": list(item.depends_on), "locks": list(item.resource_locks), "verificationMethods": list(item.verification_methods), "selectedReason": item.selected_reason} for item in plan.tasks],
        "blockedReason": plan.blocked_reason,
        "policy": EXECUTION_POLICY,
    }


def main() -> int:
    args = _parser().parse_args()
    if args.mode == "production" and (not args.project_id or not args.conversation_id):
        print(json.dumps({"ok": False, "error": "REQUEST_SCOPED_BUILD_CONTEXT_REQUIRED"}))
        return 2
    workspace_root = Path(args.workspace_root).resolve()
    trace_root = Path(args.trace_root).resolve()
    if not workspace_root.is_dir() or workspace_root not in trace_root.parents and trace_root != workspace_root / "evidence" / "agent-traces":
        # Trace output must stay within the server-selected build workspace evidence directory.
        print(json.dumps({"ok": False, "error": "INVALID_SERVER_TRACE_SCOPE"}))
        return 2
    context = BuildContext(
        run_id=args.run_id,
        request=args.request,
        workspace_id=args.workspace_id,
        workspace_root=str(workspace_root),
        project_id=args.project_id,
        conversation_id=args.conversation_id,
        granted_tool_scopes=("workspace.read", "workspace.write"),
        dry_run=args.mode != "production",
        metadata={"evidence_only": args.evidence_only},
    )
    supervisor = Supervisor(TraceStore(trace_root))
    plan = supervisor.plan(context)
    payload: dict[str, object] = {"ok": True, "registryCount": len(AGENT_REGISTRY), "mode": args.mode, "plan": _public_plan(plan)}
    if args.agent_id:
        if args.mode != "production":
            print(json.dumps({"ok": False, "error": "AGENT_SINGLE_EXECUTION_REQUIRES_PRODUCTION_MODE"}))
            return 2
        selected_task = next((task for task in plan.tasks if task.agent_id == args.agent_id), None)
        if not selected_task:
            print(json.dumps({"ok": False, "error": "AGENT_NOT_SELECTED_FOR_REQUEST"}))
            return 2
        execution, trace = get_agent(args.agent_id).run(context, selected_task)
        trace_file = supervisor.trace_store.append(trace)
        payload["agentExecution"] = {
            "executionMode": "production",
            "agentId": args.agent_id,
            "taskId": selected_task.task_id,
            "status": execution.status.value,
            "changedFiles": list(execution.changed_files),
            "evidenceRefs": list(execution.evidence_refs),
            "executionMetadata": {
                "producedArtifactCount": len(execution.produced_artifacts),
                "verificationCount": len(execution.verification_report),
                "nextActionCount": len(execution.next_actions),
            },
            "blockedReason": execution.blocked_reason,
            "traceFile": Path(trace_file).name,
        }
        print(json.dumps(payload, ensure_ascii=False, sort_keys=True))
        return 0
    if args.mode in {"dry-run", "production"}:
        result = supervisor.execute(context, plan)
        payload["execution"] = {
            "executionMode": "dry-run" if args.mode == "dry-run" else "production",
            "checkpointAllowed": result.checkpoint_allowed,
            "taskGraph": result.graph.as_dict(),
            "acceptanceRows": [{"criterion": row.criterion, "status": row.status, "evidencePath": row.evidence_path, "testCommand": row.test_command, "explanation": row.explanation} for row in result.acceptance_rows],
            "traceFile": str(Path(result.trace_path).name) if result.trace_path else None,
        }
    print(json.dumps(payload, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
