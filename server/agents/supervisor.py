"""Sequential, dependency-aware supervisor for the canonical SmartBuild registry."""
from __future__ import annotations

import re
from dataclasses import dataclass
from time import time
from uuid import uuid4

from .agent_specs import AgentTrace, BuildContext, OrchestrationPlan, TaskDefinition, TaskStatus
from .builder_brain import build_builder_brain_contract
from .feedback_gate import feedback_required
from .file_lock_manager import FileLockManager
from .execution_support import normalize_request_text
from .registry import AGENT_REGISTRY, get_agent
from .secret_requirements import requirement_for_request
from .task_graph import GraphNodeStatus, TaskGraph
from .trace_store import TraceStore
from .verification_gate import AcceptanceRow, checkpoint_allowed


EXECUTION_POLICY = {
    "execution_policy": "sequential_by_default",
    "max_concurrency": 1,
    "run_only_selected_agents": True,
    "require_dependency_completion": True,
    "require_file_locks": True,
    "allow_parallel_read_only_agents": False,
    "allow_external_side_effects_without_approval": False,
}

# These words describe the user action rather than a specialist capability.  They
# must never select the entire catalog merely because every valid request starts
# with "build" or "create".
_GENERIC_SELECTION_TRIGGERS = frozenset({"build", "create", "make", "implement", "app", "website"})
_MAX_DIRECT_SPECIALISTS = 8

# Read access is independently constrained from write access. Governance agent_009
# may inspect only stable, selected-run web source and per-agent execution evidence;
# it never receives the broad project-root write scope used by source writers.
_TASK_READ_SCOPE_OVERRIDES: dict[str, tuple[str, ...]] = {
    "agent_009": (
        "index.html",
        "app.js",
        "styles.css",
        "form-validation.js",
        "evidence/agent-executions/**",
    ),
}


def _trigger_matches(text: str, trigger: str) -> bool:
    """Match capability words without treating a substring as a capability."""
    normalized_text = normalize_request_text(text)
    normalized_trigger = normalize_request_text(trigger)
    return re.search(rf"(?<!\w){re.escape(normalized_trigger)}(?!\w)", normalized_text) is not None


@dataclass(frozen=True)
class SupervisorResult:
    plan: OrchestrationPlan
    graph: TaskGraph
    trace_path: str | None
    checkpoint_allowed: bool
    acceptance_rows: tuple[AcceptanceRow, ...]


class Supervisor:
    """Selects the smallest matching capability set and executes one ready node at a time."""

    def __init__(self, trace_store: TraceStore | None = None) -> None:
        self.trace_store = trace_store or TraceStore()

    def plan(self, context: BuildContext) -> OrchestrationPlan:
        text = context.request.lower()
        builder_brain = build_builder_brain_contract(context)
        secret_requirements = requirement_for_request(context.request)
        clarification_required = self._needs_clarification(text)
        selected_ids = self._selected_ids(text, builder_brain.capability_status)
        if clarification_required:
            selected_ids = {"agent_001"}
        elif builder_brain.capability_status != "bounded-writer-supported":
            # Retain only the contract-producing agent. The production worker will
            # persist its scoped plan evidence then report a truthful BLOCKED result;
            # no unrelated template/writer task may run for an unsupported request.
            selected_ids = {"agent_003"}
        else:
            if secret_requirements:
                selected_ids.add("agent_002")
            if feedback_required(context):
                selected_ids.add("agent_004")
        selected_ids = self._include_selected_prerequisites(selected_ids)
        ordered = self._topological_agent_order(selected_ids)
        tasks: list[TaskDefinition] = []
        selected_specs = []
        completed_task_ids: dict[str, str] = {}
        for agent_id in ordered:
            agent = get_agent(agent_id)
            selected_specs.append(agent.spec)
            dependencies = tuple(completed_task_ids[dep] for dep in agent.spec.prerequisites if dep in completed_task_ids)
            task_id = f"{context.run_id}:{agent_id}"
            task = TaskDefinition(
                task_id=task_id, agent_id=agent_id, title=agent.spec.name, purpose=agent.spec.role,
                depends_on=dependencies, inputs=agent.spec.required_inputs, outputs=agent.spec.produced_artifacts,
                allowed_tool_scopes=agent.spec.allowed_tool_scopes, allowed_path_scopes=agent.spec.allowed_path_scopes,
                allowed_read_path_scopes=_TASK_READ_SCOPE_OVERRIDES.get(agent_id, agent.spec.allowed_path_scopes),
                resource_locks=agent.spec.resource_locks, verification_methods=agent.spec.verification_methods,
                selected_reason=self._reason(agent.spec.triggers, text),
            )
            tasks.append(task)
            completed_task_ids[agent_id] = task_id
        if tasks:
            verification_task = TaskDefinition(
                task_id=f"{context.run_id}:verification-gate", agent_id="system.verification_gate", title="Verification Gate",
                purpose="Require one passing evidence row per required criterion before checkpoint.", depends_on=tuple(task.task_id for task in tasks),
                verification_methods=("all-required-criteria-pass",), selected_reason="VERIFICATION_GATE_REQUIRED",
            )
            checkpoint_task = TaskDefinition(
                task_id=f"{context.run_id}:checkpoint", agent_id="system.checkpoint", title="Checkpoint",
                purpose="Create a checkpoint only after the verification gate passes.", depends_on=(verification_task.task_id,),
                verification_methods=("checkpoint-after-all-pass",), selected_reason="CHECKPOINT_AFTER_VERIFICATION",
            )
            tasks.extend((verification_task, checkpoint_task))
        selected_set = {spec.id for spec in selected_specs}
        skipped = tuple((agent_id, "TRIGGER_NOT_MATCHED_OR_NOT_REQUIRED") for agent_id in AGENT_REGISTRY if agent_id not in selected_set)
        traces = tuple(self._selection_trace(context, task) for task in tasks if task.agent_id.startswith("agent_"))
        blocked_reason = (
            "UNSUPPORTED_IMPLEMENTATION_CAPABILITY"
            if builder_brain.capability_status != "bounded-writer-supported"
            else "REQUIRED_SECRET_NOT_CONFIGURED" if secret_requirements else None
        )
        return OrchestrationPlan(context.run_id, context.request, tuple(selected_specs), skipped, tuple(tasks), traces, blocked_reason)

    def execute(self, context: BuildContext, plan: OrchestrationPlan | None = None) -> SupervisorResult:
        plan = plan or self.plan(context)
        graph = TaskGraph(context.run_id)
        for task in plan.tasks:
            graph.add(task)
        locks = FileLockManager()
        traces = list(plan.traces)
        trace_path: str | None = None
        for trace in traces:
            trace_path = self.trace_store.append(trace)
        secret_requirements = requirement_for_request(context.request)
        while node := graph.next_ready():
            task = graph.mark_running(node.task.task_id).task
            if task.agent_id == "system.verification_gate":
                rows = self._acceptance_rows(graph)
                status = GraphNodeStatus.PASS if checkpoint_allowed(rows) else GraphNodeStatus.BLOCKED
                graph.complete(task.task_id, status, ("verification-report.json",), None if status == GraphNodeStatus.PASS else "REQUIRED_CRITERIA_NOT_ALL_PASS")
                continue
            if task.agent_id == "system.checkpoint":
                predecessor = graph.nodes[task.depends_on[0]]
                graph.complete(task.task_id, GraphNodeStatus.PASS if predecessor.status == GraphNodeStatus.PASS else GraphNodeStatus.BLOCKED, ("checkpoint-manifest.json",) if predecessor.status == GraphNodeStatus.PASS else (), None if predecessor.status == GraphNodeStatus.PASS else "CHECKPOINT_GATE_FAILED")
                continue
            if task.agent_id == "agent_002" and secret_requirements:
                graph.complete(task.task_id, GraphNodeStatus.BLOCKED, (), " ; ".join(item.reason for item in secret_requirements))
                continue
            if task.agent_id == "agent_001" and self._needs_clarification(context.request.lower()):
                graph.complete(task.task_id, GraphNodeStatus.NEEDS_USER_INPUT, (), "IMPORTANT_REQUIREMENT_MISSING")
                continue
            if not locks.acquire(task.task_id, task.resource_locks):
                graph.complete(task.task_id, GraphNodeStatus.BLOCKED, (), "RESOURCE_LOCK_CONFLICT")
                continue
            execution, trace = get_agent(task.agent_id).run(context, task)
            trace_path = self.trace_store.append(trace)
            traces.append(trace)
            terminal = GraphNodeStatus.PASS if get_agent(task.agent_id).verify(execution) else (GraphNodeStatus.NEEDS_USER_INPUT if execution.status in {TaskStatus.WAITING_FOR_CLARIFICATION, TaskStatus.WAITING_FOR_FEEDBACK, TaskStatus.WAITING_FOR_SECRET} else GraphNodeStatus.BLOCKED)
            graph.complete(task.task_id, terminal, execution.evidence_refs, execution.blocked_reason)
            locks.release(task.task_id)
        rows = self._acceptance_rows(graph)
        return SupervisorResult(plan, graph, trace_path, checkpoint_allowed(rows), rows)

    def _selected_ids(self, text: str, capability_status: str = "bounded-writer-supported") -> set[str]:
        selected = {"agent_003"}
        if capability_status != "bounded-writer-supported":
            return selected
        ranked: list[tuple[int, str]] = []
        for agent_id, cls in AGENT_REGISTRY.items():
            # No-Fake Assurer needs a durable page writer before it can inspect;
            # select it only in the explicit page-work branch below.
            if agent_id == "agent_009":
                continue
            # Credential-bearing specialists are selected only by the explicit secret
            # requirement detector.  A contact form's `email` field is not a request
            # to connect an email-delivery provider.
            if cls.spec.requires_secret:
                continue
            specific_matches = tuple(
                trigger for trigger in cls.spec.triggers
                if trigger not in _GENERIC_SELECTION_TRIGGERS and self._trigger_requested(text, trigger)
            )
            if agent_id == "agent_006" and not any(
                trigger in {"database", "sqlite", "persistence", "save"}
                for trigger in specific_matches
            ):
                continue
            if specific_matches:
                ranked.append((len(specific_matches), agent_id))
        selected.update(agent_id for _, agent_id in sorted(ranked, key=lambda item: (-item[0], item[1]))[:_MAX_DIRECT_SPECIALISTS])
        page_work_requested = any(
            self._trigger_requested(text, term)
            for term in (
                "page", "landing", "saas", "contact", "form", "site", "website", "store", "shop",
                "ecommerce", "commerce", "catalog", "cart", "موقع", "صفحة", "متجر", "متاجر",
                "تسوق", "ملابس", "أزياء", "ازياء", "إكسسوارات", "اكسسوارات", "book club",
                "reading club", "book community", "نادي قراءة", "نادي القراءة", "لنادي القراءة", "نادي الكتاب",
                "marketplace", "exchange", "tool library", "tool lending", "tool-lending", "borrowing",
                "تبادل", "سوق مجتمعي", "إعارة", "استعارة",
            )
        ) or self._trigger_requested(text, "ui")
        if page_work_requested:
            # agent_009 is a bounded source/evidence inspector for page work. It
            # intentionally is not selected for every non-page request, so its
            # writer prerequisite cannot cause unrelated source generation.
            selected.update({"agent_005", "agent_009", "agent_029", "agent_030", "agent_033"})
        if self._trigger_requested(text, "contact") and any(
            self._trigger_requested(text, term)
            for term in ("database", "sqlite", "backend", "post", "persistence", "playwright")
        ):
            selected.update({"agent_006", "agent_007", "agent_019", "agent_021", "agent_022", "agent_023", "agent_024", "agent_045", "agent_046", "agent_051", "agent_069"})
        return selected

    @staticmethod
    def _trigger_requested(text: str, trigger: str) -> bool:
        if not _trigger_matches(text, trigger):
            return False
        negated_trigger = re.compile(
            r"\b(?:no|without|avoid|exclude|excluding|do not|don't|not(?!\s+only))"
            rf"\b(?:(?![.!?;]).{{0,48}}\b{re.escape(trigger)}\b)",
            re.IGNORECASE,
        )
        return negated_trigger.search(text) is None

    @staticmethod
    def _needs_clarification(text: str) -> bool:
        normalized = normalize_request_text(text.strip())
        if normalized in {"build", "make", "create", "help", "ابني موقع", "اعمل موقع", "صمم موقع", "أنشئ موقع", "انشئ موقع"}:
            return True
        purpose_terms = (
            "portfolio", "photographer", "restaurant", "cafe", "shop", "store", "blog", "news",
            "education", "course", "school", "clinic", "medical", "health", "real estate",
            "event", "hotel", "travel", "fitness", "gym", "salon", "agency", "bakery",
            "dashboard", "admin", "login", "book club", "reading club", "book community",
            "sign in", "booking", "reservation", "recipe", "social network", "chat", "library",
            "marketplace", "exchange", "tool library", "tool lending", "tool-lending", "borrowing",
            "contact", "متجر", "تسوق", "مدونة", "أخبار", "تعليم", "دورات", "مدرسة", "عيادة",
            "طبي", "صحة", "عقارات", "عقار", "فعاليات", "فندق", "سفر", "لياقة", "رياضة",
            "صالون", "وكالة", "مخبز", "جمعية", "مطعم", "مقهى", "معرض أعمال", "معرض اعمال",
            "ملف أعمال", "ملف اعمال", "مصور", "تصوير", "تواصل", "اتصل", "دخول", "تسجيل",
            "لوحة تحكم", "حجز", "وصفات", "مكتبة", "شبكة اجتماعية", "محادثة", "نادي قراءة",
            "نادي القراءة", "نادي الكتاب", "تبادل", "سوق مجتمعي", "إعارة", "استعارة",
        )
        if any(term in normalized for term in purpose_terms):
            return False
        generic_build_terms = (
            "website", "web site", "web app", "site", "page", "app",
        )
        if normalized in {"build", "create", "make", "design", "develop", "help"}:
            return True
        return bool(
            re.search(r"\b(?:build|create|develop)\b", normalized)
            or any(term in normalized for term in ("ابني", "اعمل", "صمم", "صمّم", "أنشئ", "انشئ", "طور", "طوّر"))
            or re.search(r"\b(?:" + "|".join(re.escape(term) for term in generic_build_terms) + r")\b", normalized)
            or any(term in normalized for term in ("موقع", "صفحة", "تطبيق"))
        )

    def _include_selected_prerequisites(self, selected: set[str]) -> set[str]:
        changed = True
        while changed:
            changed = False
            for agent_id in tuple(selected):
                for dependency in get_agent(agent_id).spec.prerequisites:
                    if dependency not in selected:
                        selected.add(dependency)
                        changed = True
        return selected

    def _topological_agent_order(self, selected: set[str]) -> tuple[str, ...]:
        pending = set(selected)
        ordered: list[str] = []
        while pending:
            ready = sorted(agent_id for agent_id in pending if set(get_agent(agent_id).spec.prerequisites).issubset(set(ordered)))
            if not ready:
                raise RuntimeError("AGENT_DEPENDENCY_CYCLE")
            ordered.extend(ready)
            pending.difference_update(ready)
        return tuple(ordered)

    @staticmethod
    def _reason(triggers: tuple[str, ...], text: str) -> str:
        matched = [trigger for trigger in triggers if Supervisor._trigger_requested(text, trigger)]
        # This field reaches the persisted Build-Run plan and the audited Agents
        # surface. Keep it a stable code rather than copying request words.
        return "REQUEST_CAPABILITY_MATCH" if matched else "SCOPED_WORKFLOW_DEPENDENCY"

    @staticmethod
    def _selection_trace(context: BuildContext, task: TaskDefinition) -> AgentTrace:
        return AgentTrace(uuid4().hex, context.run_id, task.agent_id, task.task_id, "agent.selected", TaskStatus.PLANNED, int(time() * 1000), selected_reason=task.selected_reason)

    @staticmethod
    def _acceptance_rows(graph: TaskGraph) -> tuple[AcceptanceRow, ...]:
        rows: list[AcceptanceRow] = []
        for node in graph.nodes.values():
            if not node.task.agent_id.startswith("agent_"):
                continue
            status = "PASS" if node.status == GraphNodeStatus.PASS else ("NEEDS_USER_INPUT" if node.status == GraphNodeStatus.NEEDS_USER_INPUT else "BLOCKED" if node.status in {GraphNodeStatus.BLOCKED, GraphNodeStatus.SKIPPED} else "FAILED")
            rows.append(AcceptanceRow(node.task.title, status, node.evidence[0] if node.evidence else None, "supervisor.execute", node.blocked_reason or "Agent evidence recorded."))
        return tuple(rows)
