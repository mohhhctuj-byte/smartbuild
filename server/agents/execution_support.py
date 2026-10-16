"""Scoped file and evidence helpers used by responsibility-specific Python agents."""
from __future__ import annotations

import fnmatch
import hashlib
import json
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from time import time

from .agent_specs import BuildContext, TaskDefinition, TaskStatus, assert_safe_relative_path
from .base import AgentExecution, SAFE_BLOCKED_REASON_CODES, SpecialistAgent, safe_blocked_reason


def _safe_blocked_reason(reason: str | None) -> str:
    return safe_blocked_reason(reason)


def normalize_request_text(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text.casefold())
    return "".join(char for char in decomposed if not unicodedata.category(char).startswith("M"))


def _root(context: BuildContext) -> Path:
    root = Path(context.workspace_root).resolve()
    if not root.is_dir():
        raise RuntimeError("SCOPED_WORKSPACE_NOT_AVAILABLE")
    return root


def _safe_path(context: BuildContext, relative_path: str) -> Path:
    assert_safe_relative_path(relative_path)
    path = (_root(context) / relative_path).resolve()
    if _root(context) not in path.parents:
        raise RuntimeError("AGENT_PATH_OUTSIDE_WORKSPACE")
    return path


def _path_allowed(relative_path: str, allowed_path_scopes: tuple[str, ...]) -> bool:
    normal = relative_path.replace("\\", "/")
    for scope in allowed_path_scopes:
        normalized_scope = scope.replace("\\", "/")
        # `project/**` is the canonical task-scope alias for any safe project-relative file,
        # including a root artifact such as index.html.
        if normalized_scope == "project/**":
            return True
        if fnmatch.fnmatchcase(normal, normalized_scope):
            return True
    return False


def write_project_file(context: BuildContext, task: TaskDefinition, relative_path: str, content: str) -> str:
    if "workspace.write" not in context.granted_tool_scopes:
        raise RuntimeError("MISSING_TOOL_SCOPE:workspace.write")
    if not task.allowed_path_scopes:
        raise RuntimeError("MISSING_TASK_PATH_SCOPE")
    if not _path_allowed(relative_path, task.allowed_path_scopes):
        raise RuntimeError("AGENT_OUTPUT_PATH_OUTSIDE_TASK_SCOPE")
    if not content.strip():
        raise RuntimeError("AGENT_REFUSED_EMPTY_FILE")
    path = _safe_path(context, relative_path)
    if path.parts[-1].startswith(".") or ".env" in path.name.lower() or "evidence" in path.parts:
        raise RuntimeError("AGENT_PROHIBITED_OUTPUT_PATH")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return relative_path


def read_project_file(context: BuildContext, task: TaskDefinition, relative_path: str) -> str:
    """Read one bounded, task-authorized UTF-8 project source file.

    Reviewers use this helper rather than a direct filesystem read so they cannot
    inspect files outside the Build Run or outside their supervisor-provided scope.
    The error codes intentionally omit filesystem paths and source content.
    """
    if "workspace.read" not in context.granted_tool_scopes:
        raise RuntimeError("MISSING_TOOL_SCOPE:workspace.read")
    # Keep legacy/manual TaskDefinitions compatible while making production read
    # authorization independent from the write-only allowed_path_scopes field.
    allowed_read_scopes = task.allowed_read_path_scopes or task.allowed_path_scopes
    if not allowed_read_scopes or not _path_allowed(relative_path, allowed_read_scopes):
        raise RuntimeError("AGENT_READ_PATH_OUTSIDE_TASK_SCOPE")
    path = _safe_path(context, relative_path)
    if not path.is_file() or path.stat().st_size > 256_000:
        raise RuntimeError("SCOPED_SOURCE_NOT_AVAILABLE")
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        raise RuntimeError("SCOPED_SOURCE_NOT_AVAILABLE") from exc


def _is_original_canonical_agent(agent: SpecialistAgent) -> bool:
    try:
        return agent.spec.source_role_id is None and 1 <= int(agent.spec.id.removeprefix("agent_")) <= 70
    except ValueError:
        return False


def _original_work_products(agent: SpecialistAgent, context: BuildContext, task: TaskDefinition, responsibility: str, findings: tuple[str, ...]) -> tuple[str, str]:
    """Write a paired, content-safe work product for a successful original agent.

    The report is scoped to the BuildContext tuple and task, but intentionally does
    not copy request text, findings, logs, model output, credentials, or provider data.
    """
    safe_task_id = task.task_id.replace(":", "_")
    base_path = f"agent-artifacts/original/{agent.spec.id}/{safe_task_id}"
    fingerprint = hashlib.sha256(
        (
            f"{context.run_id}|{context.project_id}|{context.conversation_id}|{task.task_id}|"
            f"{agent.spec.id}|{context.request.strip()}"
        ).encode("utf-8")
    ).hexdigest()[:24]
    report = "\n".join((
        f"# {agent.spec.name} responsibility report",
        "",
        f"- Agent: `{agent.spec.id}`",
        f"- Team: `{agent.spec.team}`",
        f"- Task: `{task.task_id}`",
        f"- Build scope: `{context.run_id}` / `{context.project_id}` / `{context.conversation_id}`",
        f"- Responsibility: {responsibility}",
        f"- Finding count: `{len(findings)}`",
        f"- Request-scope fingerprint: `{fingerprint}`",
        "- External actions: not-performed",
        "",
        "This bounded report records only the completion of the assigned responsibility."
    )) + "\n"
    manifest = {
        "format": "smartbuild-agent-work-product-v1",
        "canonicalAgentId": agent.spec.id,
        "agentKind": "original-canonical",
        "buildScope": {
            "buildRunId": context.run_id,
            "projectId": context.project_id,
            "conversationId": context.conversation_id,
            "taskId": task.task_id,
        },
        "requestScopeFingerprint": fingerprint,
        "actions": [{"kind": "responsibility-report", "status": "completed"}],
        "externalActions": "not-performed",
    }
    report_path = write_project_file(context, task, f"{base_path}.md", report)
    manifest_path = write_project_file(
        context,
        task,
        f"{base_path}.work-product.json",
        json.dumps(manifest, ensure_ascii=False, sort_keys=True, separators=(",", ":")),
    )
    return report_path, manifest_path


def agent_evidence(agent: SpecialistAgent, context: BuildContext, task: TaskDefinition, *, responsibility: str, findings: tuple[str, ...], changed_files: tuple[str, ...] = (), status: TaskStatus = TaskStatus.SUCCEEDED, blocked_reason: str | None = None) -> AgentExecution:
    produced_files = changed_files
    if status == TaskStatus.SUCCEEDED and _is_original_canonical_agent(agent):
        produced_files = (*changed_files, *_original_work_products(agent, context, task, responsibility, findings))
    safe_blocked_reason = _safe_blocked_reason(blocked_reason) if status == TaskStatus.BLOCKED else None
    safe_findings = (safe_blocked_reason,) if safe_blocked_reason is not None else findings
    evidence_relative = f"evidence/agent-executions/{task.task_id.replace(':', '_')}.json"
    evidence_path = _safe_path(context, evidence_relative)
    evidence_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "runId": context.run_id,
        "projectId": context.project_id,
        "conversationId": context.conversation_id,
        "agentId": agent.spec.id,
        "agentName": agent.spec.name,
        "taskId": task.task_id,
        "responsibility": responsibility,
        "status": status.value,
        "changedFiles": list(produced_files),
        "findings": list(safe_findings),
        "blockedReason": safe_blocked_reason,
        "timestampMs": int(time() * 1000),
    }
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    evidence_path.write_text(encoded, encoding="utf-8")
    digest = hashlib.sha256(encoded.encode("utf-8")).hexdigest()
    evidence_ref = f"{evidence_relative}#sha256:{digest}"
    return AgentExecution(
        context.run_id, agent.spec.id, task.task_id, status,
        f"{agent.spec.name}: {responsibility}", changed_files=produced_files,
        produced_artifacts=produced_files, evidence_refs=(evidence_ref,),
        logs=(f"Responsibility completed: {responsibility}.",),
        verification_report=("scoped-evidence-written",),
        next_actions=("Await the next dependency-aware task.",) if status == TaskStatus.SUCCEEDED else (),
        blocked_reason=safe_blocked_reason,
    )


def blocked(agent: SpecialistAgent, context: BuildContext, task: TaskDefinition, responsibility: str, reason: str) -> AgentExecution:
    return agent_evidence(agent, context, task, responsibility=responsibility, findings=(reason,), status=TaskStatus.BLOCKED, blocked_reason=reason)


def request_title(context: BuildContext) -> str:
    candidate = str(context.metadata.get("project_title", ""))
    named_project = re.search(r"\b(?:called|named)\s+[\"“']?([^\"'“”.,!?;]{2,60})", context.request, re.IGNORECASE)
    if named_project and any(term in normalize_request_text(context.request) for term in ("cafe", "coffee shop", "coffeehouse", "coffee house", "مقهى", "كافيه")):
        candidate = named_project.group(1).strip()
    candidate = "".join(char for char in candidate if char == "\t" or ord(char) >= 32)
    candidate = " ".join(candidate.split())
    if candidate and len(candidate) <= 80 and "<" not in candidate:
        return candidate
    request = normalize_request_text(context.request)
    category_titles = (
        (("tool lending", "tool-lending", "tool library", "tool share", "tool-share", "borrow tools", "إعارة أدوات", "استعارة أدوات"), "Neighborhood Tool Share"),
        (("reading club", "book club", "book community", "نادي قراءة", "لنادي قراءة", "نادي القراءة", "لنادي القراءة", "نادي الكتاب", "لنادي الكتاب"), "Reading Club"),
        (("portfolio", "case study", "freelancer", "بورتفوليو", "معرض أعمال"), "Portfolio website"),
        (("restaurant", "cafe", "menu", "bistro", "مطعم", "كافيه", "منيو", "مقهى"), "Restaurant website"),
        (("contact", "contact form", "get in touch", "تواصل", "نموذج اتصال"), "Contact page"),
        (("store", "shop", "catalog", "commerce", "متجر", "متجر إلكتروني"), "Storefront website"),
        (("dashboard", "analytics", "admin", "لوحة تحكم", "داشبورد"), "Dashboard workspace"),
        (("landing page", "saas", "startup", "صفحة هبوط", "شركة ناشئة"), "Product landing page"),
    )
    for triggers, title in category_titles:
        if any(trigger in request for trigger in triggers):
            return title
    return "Request-scoped web experience"


@dataclass(frozen=True)
class RequestProfile:
    """A bounded, display-safe description of a supported website category.

    This intentionally uses category triggers only. It never returns raw request text,
    model output, workspace paths, or user-provided secrets for inclusion in source.
    """

    key: str
    eyebrow: str
    summary: str
    primary_section_title: str
    primary_section_copy: str
    secondary_section_title: str
    secondary_section_copy: str
    primary_action: str
    product_category: str = "custom"


def request_profile(context: BuildContext) -> RequestProfile:
    request = normalize_request_text(context.request)
    profiles = (
        (("tool lending", "tool-lending", "tool library", "borrow tools", "tool share", "tool-share", "إعارة أدوات", "استعارة أدوات"), RequestProfile(
            "tool-lending", "Borrow better, together",
            "A neighborhood tool library for finding useful gear, checking availability, and requesting a local loan.",
            "Find the right tool", "Browse fictional community listings and narrow them by category and availability.",
            "Your loan requests", "Requests stay in this browser preview and never claim a pickup is confirmed.",
            "Browse available tools", "marketplace",
        )),
        (("reading club", "book club", "book community", "نادي قراءة", "لنادي قراءة", "نادي القراءة", "لنادي القراءة", "نادي الكتاب", "لنادي الكتاب"), RequestProfile(
            "reading-club", "A welcoming reading club · 24 members",
            "A shared home for the club's reading list, next meetup, and member check-ins.",
            "This month's bookshelf", "Browse the current picks, search titles, and keep a local record of books you have finished.",
            "Next meetup", "See the plan and RSVP locally. No invitations or external messages are sent.",
            "Explore this month's books", "social_network",
        )),
        (("wellness", "wellbeing", "well-being", "yoga", "pilates", "spa", "massage", "meditation", "mindfulness", "استوديو عافية", "يوجا", "يوغا", "بيلاتس", "سبا", "مساج", "تأمل"), RequestProfile(
            "wellness", "Restorative studio",
            "A calm wellness booking experience for choosing a service, finding availability, and requesting a session.",
            "Choose your practice", "Service cards make each session understandable before a client commits.",
            "Find your rhythm", "Availability stays clear and local without claiming an external booking provider.",
            "Explore sessions", "booking",
        )),
        (("portfolio", "case study", "freelancer", "بورتفوليو", "معرض أعمال"), RequestProfile(
            "portfolio", "Independent portfolio",
            "A focused home for selected work, approach, and a clear next conversation.",
            "Selected work", "Case-study cards make the strongest outcomes easy to scan.",
            "Working together", "A concise process section sets expectations before contact.",
            "Explore selected work", "custom",
        )),
        (("cafe", "coffee shop", "coffeehouse", "coffee house", "café", "كافيه", "مقهى"), RequestProfile(
            "cafe", "Neighborhood café",
            "A welcoming café for browsing the menu, preparing a pickup order, and planning a visit.",
            "Made for your next coffee break", "Browse a concise menu and build a pickup order that stays in this browser session.",
            "Find your way here", "Check today's opening hours and the café's neighborhood location.",
            "Explore the menu", "restaurant",
        )),
        (("restaurant", "cafe", "menu", "bistro", "مطعم", "كافيه", "منيو"), RequestProfile(
            "restaurant", "Neighborhood dining",
            "A welcoming restaurant page for menu discovery, visiting details, and table planning.",
            "Menu highlights", "A curated set of seasonal dishes leads guests toward the menu.",
            "Plan your visit", "Hours and table planning are kept visible without a fake booking integration.",
            "View menu highlights", "restaurant",
        )),
        (("contact", "contact form", "get in touch", "تواصل", "نموذج اتصال"), RequestProfile(
            "contact", "Start a conversation",
            "A focused contact page with client-side field checks and no unconfigured message delivery.",
            "Share your details", "Required fields are checked locally before any next step is considered.",
            "What happens next", "Message delivery remains unavailable until a server-side contact capability is explicitly configured.",
            "Open contact form", "contact",
        )),
        (("store", "shop", "catalog", "commerce", "متجر", "متجر إلكتروني"), RequestProfile(
            "storefront", "Curated storefront",
            "A product-led storefront concept that helps visitors browse a focused collection.",
            "Featured collection", "A clear collection area gives products a deliberate first impression.",
            "Shopping support", "Shipping and returns guidance stays explicit until a real commerce provider is configured.",
            "Browse the collection", "ecommerce",
        )),
        (("dashboard", "analytics", "admin", "لوحة تحكم", "داشبورد"), RequestProfile(
            "dashboard", "Product workspace",
            "A calm dashboard landing surface that organizes the work before live data is connected.",
            "Operational overview", "A dedicated panel frames the metrics and actions a team will need.",
            "Data connection", "Live analytics remain blocked until a scoped data source is approved.",
            "Review workspace structure", "dashboard",
        )),
        (("landing page", "saas", "startup", "صفحة هبوط", "شركة ناشئة"), RequestProfile(
            "product", "Product introduction",
            "A product landing page that clarifies the offer, its value, and the next step.",
            "Why it matters", "A benefit-led section gives the product story a clear structure.",
            "Built to extend", "Implementation details can grow only after the required integrations are approved.",
            "See the product story", "custom",
        )),
    )
    for triggers, profile in profiles:
        if any(trigger in request for trigger in triggers):
            return profile
    return RequestProfile(
        "general", "Request-scoped web experience",
        "A clear first page prepared for the selected build run.",
        "Starting point", "The first scoped source files are ready for the next verified task.",
        "Next scoped task", "Additional capabilities remain explicit until their requirements are verified.",
        "Review the starting point", "custom",
    )


def requested_reading_club_book_title(context: BuildContext) -> str | None:
    request = context.request
    if not re.search(r"\b(?:change|edit|modify|update|rename|replace)\b|(?:غيّر|غير|بدّل|بدل|استبدل|عدل|عدّل)", request, re.IGNORECASE):
        return None
    match = re.search(
        r"(?:\bto\b|\binto\b|\bas\b|إلى|الى)\s+([A-Za-z0-9][A-Za-z0-9 '-]{1,59}?)(?=\s+(?:in|everywhere|throughout|and|while|في|مع|وحافظ)\b|[.!?،]|$)",
        request,
        re.IGNORECASE,
    )
    return match.group(1).strip() if match else None


def requested_tool_lending_additions(context: BuildContext) -> tuple[dict[str, str | bool], ...]:
    request = context.request
    if not re.search(r"\b(?:add|include)\b|(?:أضف|اضف|ضيف|إضافة|اضافة)", request, re.IGNORECASE):
        return ()
    patterns = (
        re.compile(
            r"\b(?:add|include)\s+(?:(?:one|a|an|another)\s+)?"
            r"(?:(?:new|fictional|available)\s+)*(?:tool\s+)?(?:listing\s+)?"
            r"(?:for\s+|called\s+|named\s+)(?:a\s+|an\s+)?"
            r"(?P<name>[A-Za-z][A-Za-z0-9 -]{1,39}?)"
            r"(?=\s+(?:and|that|make|show|include|available|in|on)\b|[.!?,;]|$)",
            re.IGNORECASE,
        ),
        re.compile(
            r"(?:ضيف|أضف|اضف)(?:لي|لنا)?\s+(?:(?:أداة|اداة|أدوات|عدة)\s+)?(?:جديدة\s+)?"
            r"(?:(?:باسم|اسمها|اسم)\s+)?"
            r"(?P<name>[\u0600-\u06FF][\u0600-\u06FF ]{1,39}?)"
            r"(?=\s+(?:متاح(?:ة)?|للإعارة|للاستعارة|وخليه|وخليها|ويظهر|وتظهر|في البحث|في الفلاتر)|[.!?،,;]|$)",
            re.IGNORECASE,
        ),
    )
    matches = sorted(
        ((match.start(), match) for pattern in patterns for match in pattern.finditer(request)),
        key=lambda item: item[0],
    )
    additions: list[dict[str, str | bool]] = []
    seen: set[str] = set()
    for _, match in matches:
        name = " ".join(match.group("name").split()).strip(" -")
        if not name:
            continue
        tool_id = re.sub(r"[^\w]+", "-", name.lower(), flags=re.UNICODE).strip("-_")
        if not tool_id or tool_id in seen:
            continue
        seen.add(tool_id)
        category, category_label = (
            ("garden", "Garden")
            if re.search(r"\b(?:garden|hose|pruner|spade|shovel)\b", name, re.IGNORECASE)
            else ("power", "Power tools")
            if re.search(r"\b(?:drill|sander|saw|power)\b", name, re.IGNORECASE)
            else ("repair", "Repair")
        )
        additions.append({
            "id": f"requested-{tool_id}",
            "name": name.title(),
            "category": category,
            "categoryLabel": category_label,
            "description": "Shared locally by a neighborhood resident.",
            "owner": "Neighborhood Tool Share",
            "pickup": "Community pickup point",
            "available": True,
        })
        if len(additions) >= 8:
            break
    return tuple(additions)


def scoped_project_identity_marker(context: BuildContext) -> str:
    """Return a deterministic, non-secret marker for one generated Build Run.

    The marker deliberately hashes only the scoped BuildContext tuple. It is safe to
    embed in generated HTML for evaluator correlation and never derives from the raw
    request, model output, secrets, or workspace path.
    """
    tuple_value = f"smartbuild-project-identity-v1|{context.run_id}|{context.project_id}|{context.conversation_id}"
    return f"scope-v1-{hashlib.sha256(tuple_value.encode('utf-8')).hexdigest()[:24]}"
