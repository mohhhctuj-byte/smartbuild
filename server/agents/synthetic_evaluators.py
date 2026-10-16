"""Bounded synthetic-user evaluators kept outside the canonical 70-agent registry.

The Python process coordinates existing browser-test infrastructure.  It never edits
workspace files, calls external providers, or treats a finding without evidence as a
confirmed bug.  Its only project outputs are redacted evidence and JSON reports.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Literal
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen

from pydantic import BaseModel, Field


class EvaluatorInstance(str, Enum):
    FUNCTIONAL = "functional_synthetic_user"
    VISUAL = "visual_synthetic_user"


class BugCategory(str, Enum):
    FUNCTIONAL = "functional"
    VISUAL = "visual"
    RESPONSIVE = "responsive"
    ACCESSIBILITY = "accessibility"
    PERFORMANCE = "performance"
    API = "api"
    DATABASE = "database"
    SECURITY = "security"
    USABILITY = "usability"
    RUNTIME = "runtime"


class BugSeverity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    UNCONFIRMED = "unconfirmed"


class BugStatus(str, Enum):
    NEW = "NEW"
    TRIAGED = "TRIAGED"
    REPAIR_PLANNED = "REPAIR_PLANNED"
    FIXED = "FIXED"
    WONT_FIX = "WONT_FIX"
    DUPLICATE = "DUPLICATE"
    UNCONFIRMED = "UNCONFIRMED"
    BLOCKED = "BLOCKED"


class BugReport(BaseModel):
    bug_id: str
    build_run_id: str
    evaluator_instance: EvaluatorInstance
    category: BugCategory
    title: str = Field(min_length=1, max_length=240)
    severity: BugSeverity
    confidence: float = Field(ge=0, le=1)
    route: str | None = None
    reproducible: bool
    steps_to_reproduce: list[str] = Field(default_factory=list)
    expected_result: str
    actual_result: str
    suspected_owner_agent: str | None = None
    selector_or_target: str | None = None
    evidence_paths: list[str] = Field(default_factory=list)
    console_errors: list[str] = Field(default_factory=list)
    network_failures: list[str] = Field(default_factory=list)
    screenshot_paths: list[str] = Field(default_factory=list)
    trace_path: str | None = None
    video_path: str | None = None
    status: BugStatus


class EvaluatorRun(BaseModel):
    evaluator_instance: EvaluatorInstance
    status: Literal["PASS", "FAILED", "SKIPPED"]
    started_at: str
    completed_at: str
    current_route: str | None = None
    current_step: str | None = None
    actions: list[dict[str, Any]] = Field(default_factory=list)
    evidence_paths: list[str] = Field(default_factory=list)
    screenshot_paths: list[str] = Field(default_factory=list)
    trace_path: str | None = None
    console_errors: list[str] = Field(default_factory=list)
    network_failures: list[str] = Field(default_factory=list)
    skip_reason: str | None = None


class RepairTask(BaseModel):
    task_id: str
    task_graph_node_id: str
    bug_id: str
    agent_id: str
    agent_name: str
    depends_on: list[str] = Field(default_factory=list)
    execution_policy: Literal["sequential"] = "sequential"
    resource_locks: list[str]
    status: Literal["REPAIR_PLANNED", "FIXED", "BLOCKED"]
    reason: str


class SyntheticEvaluation(BaseModel):
    enabled: Literal[True] = True
    execution_policy: Literal["sequential"] = "sequential"
    max_concurrency: Literal[1] = 1
    functional_user_first: Literal[True] = True
    visual_user_second: Literal[True] = True
    run_after_implementation: Literal[True] = True
    run_before_verification: Literal[True] = True
    rerun_after_repair: Literal[True] = True
    max_repair_cycles: Literal[3] = 3
    require_evidence_for_bug: Literal[True] = True
    block_checkpoint_on_critical_or_high: Literal[True] = True
    allow_unapproved_external_side_effects: Literal[False] = False
    runs: list[EvaluatorRun]
    bugs: list[BugReport]
    repair_tasks: list[RepairTask]
    repair_cycles: int = 0
    checkpoint_allowed: bool
    final_status: Literal["PASS", "FAILED", "BLOCKED"]
    output_path: str


class EvaluatorInput(BaseModel):
    run_id: str
    workspace_root: str
    evidence_root: str
    preview_url: str | None = None
    backend_url: str | None = None
    test_token: str | None = None
    template: str
    acceptance_criteria: list[dict[str, Any]] = Field(default_factory=list)
    design_reference: str | None = None
    evaluator: EvaluatorInstance | None = None


_SECRET_PATTERNS = (
    re.compile(r"(?i)(authorization\s*[:=]\s*(?:bearer\s+)?)\S+"),
    re.compile(r"(?i)(x-smartbuild-test-token\s*[:=]\s*)\S+"),
    re.compile(r"(?i)(api[_-]?key\s*[:=]\s*)\S+"),
    re.compile(r"(?i)(password\s*[:=]\s*)\S+"),
    re.compile(r"(?i)(token\s*[:=]\s*)\S+"),
)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def redact(value: str) -> str:
    redacted = value
    for pattern in _SECRET_PATTERNS:
        redacted = pattern.sub(r"\1[REDACTED]", redacted)
    return redacted[:2000]


def relative_evidence(path_value: str) -> str:
    value = path_value.replace("\\", "/").strip()
    if not value.startswith("evidence/") or ".." in value.split("/"):
        return "evidence/evaluators/redacted-invalid-reference"
    return value


_OWNER = {
    BugCategory.FUNCTIONAL: ("agent_005", "Functional Component Engineer"),
    BugCategory.VISUAL: ("agent_030", "Animation & CSS Master"),
    BugCategory.RESPONSIVE: ("agent_033", "Responsive Designer"),
    BugCategory.ACCESSIBILITY: ("agent_029", "Accessibility Expert"),
    BugCategory.PERFORMANCE: ("agent_036", "Web Vitals Agent"),
    BugCategory.API: ("agent_022", "API Designer"),
    BugCategory.DATABASE: ("agent_021", "DB Schema Specialist"),
    BugCategory.SECURITY: ("agent_023", "Security Architect"),
    BugCategory.USABILITY: ("agent_005", "Functional Component Engineer"),
    BugCategory.RUNTIME: ("agent_005", "Functional Component Engineer"),
}

def normalize_bug_category(value: object) -> BugCategory:
    """Keep evaluator findings forward-compatible with newly added categories."""
    normalized = str(value or BugCategory.FUNCTIONAL.value).strip().lower()
    try:
        return BugCategory(normalized)
    except ValueError:
        return BugCategory.RUNTIME if normalized in {"runtime", "server", "http", "browser"} else BugCategory.FUNCTIONAL


def stable_bug_id(run_id: str, evaluator: EvaluatorInstance, category: BugCategory, route: str | None, target: str | None, actual: str) -> str:
    signature = "|".join((run_id, evaluator.value, category.value, route or "", target or "", actual))
    return f"bug-{hashlib.sha256(signature.encode()).hexdigest()[:16]}"


def evidence_for_finding(finding: dict[str, Any]) -> list[str]:
    values = [*finding.get("evidencePaths", []), *finding.get("screenshotPaths", [])]
    if finding.get("tracePath"):
        values.append(finding["tracePath"])
    if finding.get("consoleErrors"):
        values.append("evidence/evaluators/console-errors.json")
    if finding.get("networkFailures"):
        values.append("evidence/evaluators/network-failures.json")
    return sorted({relative_evidence(str(value)) for value in values})


def bug_from_finding(input_value: EvaluatorInput, evaluator: EvaluatorInstance, finding: dict[str, Any]) -> BugReport:
    category = normalize_bug_category(finding.get("category"))
    route = redact(str(finding.get("route") or "/"))
    target = redact(str(finding.get("selectorOrTarget") or "")) or None
    actual = redact(str(finding.get("actualResult") or "Observed synthetic evaluator defect."))
    evidence_paths = evidence_for_finding(finding)
    has_evidence = bool(evidence_paths)
    severity_value = str(finding.get("severity", "medium"))
    severity = BugSeverity(severity_value) if severity_value in {value.value for value in BugSeverity} else BugSeverity.MEDIUM
    status = BugStatus.NEW if has_evidence else BugStatus.UNCONFIRMED
    if not has_evidence:
        severity = BugSeverity.UNCONFIRMED
    owner_id, _ = _OWNER[category]
    return BugReport(
        bug_id=stable_bug_id(input_value.run_id, evaluator, category, route, target, actual),
        build_run_id=input_value.run_id,
        evaluator_instance=evaluator,
        category=category,
        title=redact(str(finding.get("title") or "Synthetic evaluator finding")),
        severity=severity,
        confidence=min(1, max(0, float(finding.get("confidence", 0.5)))),
        route=route,
        reproducible=bool(finding.get("reproducible", True)),
        steps_to_reproduce=[redact(str(step)) for step in finding.get("stepsToReproduce", [])][:20],
        expected_result=redact(str(finding.get("expectedResult") or "Required behavior works.")),
        actual_result=actual,
        suspected_owner_agent=owner_id,
        selector_or_target=target,
        evidence_paths=evidence_paths,
        console_errors=[redact(str(item)) for item in finding.get("consoleErrors", [])][:30],
        network_failures=[redact(str(item)) for item in finding.get("networkFailures", [])][:30],
        screenshot_paths=[relative_evidence(str(item)) for item in finding.get("screenshotPaths", [])][:12],
        trace_path=relative_evidence(str(finding["tracePath"])) if finding.get("tracePath") else None,
        status=status,
    )


def deduplicate(bugs: list[BugReport]) -> list[BugReport]:
    seen: dict[tuple[str | None, BugCategory, str | None, str], BugReport] = {}
    output: list[BugReport] = []
    for bug in bugs:
        signature = (bug.route, bug.category, bug.selector_or_target, hashlib.sha256(bug.actual_result.encode()).hexdigest()[:12])
        original = seen.get(signature)
        if original:
            bug.status = BugStatus.DUPLICATE
            bug.suspected_owner_agent = original.suspected_owner_agent
        else:
            seen[signature] = bug
        output.append(bug)
    return output


def create_repair_tasks(bugs: list[BugReport]) -> list[RepairTask]:
    tasks: list[RepairTask] = []
    for bug in bugs:
        if bug.status in {BugStatus.DUPLICATE, BugStatus.UNCONFIRMED}:
            continue
        owner_id, owner_name = _OWNER[bug.category]
        tasks.append(RepairTask(task_id=f"repair:{bug.bug_id}", task_graph_node_id=f"taskgraph:repair:{bug.bug_id}", bug_id=bug.bug_id, agent_id=owner_id, agent_name=owner_name, depends_on=[f"evaluator-evidence:{bug.bug_id}"], resource_locks=["project-write"], status="REPAIR_PLANNED", reason="Synthetic evaluator evidence requires a bounded sequential, locked specialist repair node before re-evaluation."))
        bug.status = BugStatus.REPAIR_PLANNED
    return tasks


def invoke_browser_runner(input_value: EvaluatorInput) -> dict[str, Any]:
    runner = Path(__file__).with_name("synthetic_browser_runner.mjs")
    safe_payload = {
        "previewUrl": input_value.preview_url,
        "backendUrl": input_value.backend_url,
        "testToken": input_value.test_token,
        "template": input_value.template,
        "acceptanceCriteria": input_value.acceptance_criteria,
        "designReference": input_value.design_reference,
        "evidenceRoot": input_value.evidence_root,
        "evaluator": input_value.evaluator.value if input_value.evaluator else None,
    }
    configured_timeout = os.environ.get("SMARTBUILD_BROWSER_RUNNER_TIMEOUT_MS", "90000")
    try:
        timeout_seconds = min(max(int(configured_timeout), 1000), 150000) / 1000
    except ValueError:
        timeout_seconds = 90
    process = subprocess.Popen(
        [os.environ.get("SMARTBUILD_NODE_EXECUTABLE", "node"), str(runner)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        cwd=str(Path.cwd()),
        start_new_session=os.name != "nt",
    )
    try:
        stdout, stderr = process.communicate(json.dumps(safe_payload), timeout=timeout_seconds)
    except subprocess.TimeoutExpired:
        try:
            if os.name != "nt":
                os.killpg(process.pid, signal.SIGKILL)
            else:
                process.kill()
        except ProcessLookupError:
            pass
        stdout, stderr = process.communicate()
        raise RuntimeError("SYNTHETIC_BROWSER_RUNNER_TIMEOUT")
    line = next((line for line in reversed(stdout.splitlines()) if line.strip()), "")
    if process.returncode or not line:
        raise RuntimeError(redact(stderr or stdout or "SYNTHETIC_BROWSER_RUNNER_FAILED"))
    result = json.loads(line)
    if not result.get("ok"):
        raise RuntimeError(redact(str(result.get("error") or "SYNTHETIC_BROWSER_RUNNER_FAILED")))
    return result


def _fetch_preview(url: str) -> tuple[int, str, str]:
    """Read the isolated preview without allocating a Chromium process."""
    request = Request(url, headers={"User-Agent": "SmartBuild-Synthetic-User/1.0"})
    try:
        with urlopen(request, timeout=8) as response:
            return int(response.status), response.headers.get_content_type(), response.read(512 * 1024).decode("utf-8", errors="replace")
    except HTTPError as error:
        return int(error.code), error.headers.get_content_type() if error.headers else "", error.read(64 * 1024).decode("utf-8", errors="replace")
    except URLError as error:
        raise RuntimeError(f"SYNTHETIC_LIGHTWEIGHT_PREVIEW_UNAVAILABLE: {redact(str(error.reason))}") from error


def _text_from_fragment(fragment: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", fragment)).strip()[:100]


def _finding(category: str, title: str, severity: str, actual: str, target: str | None, evidence_paths: list[str], steps: list[str]) -> dict[str, Any]:
    return {
        "category": category,
        "title": title,
        "severity": severity,
        "confidence": 1,
        "route": "/",
        "reproducible": True,
        "selectorOrTarget": target,
        "expectedResult": "The requested preview behavior is available without a confirmed defect.",
        "actualResult": actual,
        "stepsToReproduce": steps,
        "evidencePaths": evidence_paths,
    }


def _has_fragment_target(document: str, fragment: str) -> bool:
    escaped = re.escape(fragment[1:])
    return bool(re.search(rf"\b(?:id|name)\s*=\s*(['\"])" + escaped + r"\1", document, flags=re.IGNORECASE))


def invoke_lightweight_runner(input_value: EvaluatorInput) -> dict[str, Any]:
    """Perform bounded, evidence-backed production checks against the live preview.

    Autoscale uses this engine rather than a full browser because the Node server,
    Python process, and Chromium renderer cannot safely share its memory limit.
    It is a real inspection: it fetches the isolated preview, validates local CSS
    delivery, and checks the served generated markup for the guarded journeys.
    """
    if not input_value.preview_url:
        return {"functional": {"status": "SKIPPED", "skipReason": "no_browser_preview"}, "visual": {"status": "SKIPPED", "skipReason": "no_browser_preview"}}
    status, content_type, document = _fetch_preview(input_value.preview_url)
    if status != 200 or "html" not in content_type.lower() or not document:
        raise RuntimeError(f"SYNTHETIC_LIGHTWEIGHT_PREVIEW_INVALID: HTTP {status} {content_type or 'unknown'}")
    evidence_root = Path(input_value.evidence_root)
    selected = input_value.evaluator
    requirement_text = " ".join(f"{item.get('id', '')} {item.get('title', '')}" for item in input_value.acceptance_criteria).lower()
    requires_form = input_value.template == "contact-form" or bool(re.search(r"form|validation|contact", requirement_text))
    links = re.findall(r"<a\b([^>]*)>(.*?)</a\s*>", document, flags=re.IGNORECASE | re.DOTALL)
    parsed_links = []
    for attrs, contents in links:
        href_match = re.search(r"\bhref\s*=\s*(['\"])(.*?)\1", attrs, flags=re.IGNORECASE)
        parsed_links.append((href_match.group(2).strip() if href_match else "", _text_from_fragment(contents)))

    functional_name, functional_trace_name = "functional-findings.json", "functional-trace.json"
    functional_evidence = [f"evidence/evaluators/{functional_name}", f"evidence/evaluators/{functional_trace_name}"]
    visual_name, visual_trace_name = "visual-findings.json", "visual-trace.json"
    visual_evidence = [f"evidence/evaluators/{visual_name}", f"evidence/evaluators/{visual_trace_name}"]
    payload: dict[str, Any] = {}

    if selected in {None, EvaluatorInstance.FUNCTIONAL}:
        findings: list[dict[str, Any]] = []
        actions: list[dict[str, Any]] = [{"route": "/", "step": "fetch-live-preview", "passed": True}, {"route": "/", "step": "inspect-link-targets", "passed": True}]
        for href, label in parsed_links:
            if href == "#":
                actions[-1]["passed"] = False
                findings.append(_finding("functional", "Required link has a fake href target", "high", f'The link "{label or "unnamed"}" uses href="#".', "a[href='#']", functional_evidence, ["Open the generated preview.", f'Inspect or activate the link "{label or "unnamed"}".']))
            elif href.startswith("#") and not _has_fragment_target(document, href):
                actions[-1]["passed"] = False
                findings.append(_finding("functional", "Navigation fragment target is missing", "medium", f"The link points to {href}, but no matching element exists.", href, functional_evidence, ["Open the generated preview.", f"Activate the link to {href}."]))
        has_form = bool(re.search(r"<form\b", document, flags=re.IGNORECASE))
        if requires_form and not has_form:
            findings.append(_finding("functional", "Required form is absent from the preview", "high", "Acceptance criteria require a form but no form element was found.", "form", functional_evidence, ["Open the generated preview."]))
        if has_form:
            has_validation_surface = bool(re.search(r"data-error-for|aria-invalid|role\s*=\s*['\"]alert", document, flags=re.IGNORECASE))
            actions.append({"route": "/", "step": "inspect-form-validation-surface", "passed": has_validation_surface})
            if not has_validation_surface:
                findings.append(_finding("functional", "Invalid form submission has no visible validation error", "high", "No field validation surface was found in the live preview source.", "form", functional_evidence, ["Open the preview.", "Submit the required form with empty values."]))
            has_success_copy = bool(re.search(r"form-status|message\s+(?:received|sent)|success", document, flags=re.IGNORECASE))
            has_submission_request = bool(re.search(r"\bfetch\s*\(|XMLHttpRequest|\.ajax\s*\(", document, flags=re.IGNORECASE))
            actions.append({"route": "/", "step": "inspect-success-request-contract", "passed": not has_success_copy or has_submission_request})
            if has_success_copy and not has_submission_request:
                findings.append(_finding("functional", "Form shows success without a successful backend request", "critical", "The preview includes a success message but no client submission request.", "#form-status", functional_evidence, ["Fill valid contact values.", "Submit the form.", "Observe the success message and request contract."]))
        trace = {"engine": "lightweight", "previewUrl": input_value.preview_url, "httpStatus": status, "contentType": content_type, "documentBytes": len(document.encode("utf-8")), "actions": actions}
        (evidence_root / functional_trace_name).write_text(json.dumps(trace, indent=2), encoding="utf-8")
        (evidence_root / functional_name).write_text(json.dumps({"evaluator": "functional_synthetic_user", "engine": "lightweight", "actions": actions, "findings": findings}, indent=2), encoding="utf-8")
        payload["functional"] = {"evaluatorInstance": "functional_synthetic_user", "status": "FAILED" if findings else "PASS", "route": "/", "step": actions[-1]["step"], "actions": actions, "findings": findings, "evidencePaths": functional_evidence, "tracePath": f"evidence/evaluators/{functional_trace_name}", "consoleErrors": [], "networkFailures": []}

    if selected in {None, EvaluatorInstance.VISUAL}:
        findings = []
        actions = [{"route": "/", "step": "fetch-live-preview", "passed": True}]
        inline_styles = len(re.findall(r"<style\b", document, flags=re.IGNORECASE))
        stylesheet_urls: list[str] = []
        for match in re.findall(r"<link\b[^>]*\bhref\s*=\s*(['\"])(.*?)\1[^>]*>", document, flags=re.IGNORECASE | re.DOTALL):
            href = match[1]
            if href.lower().split("?", 1)[0].endswith(".css"):
                stylesheet_urls.append(urljoin(input_value.preview_url, href))
        stylesheet_results: list[dict[str, Any]] = []
        css_text = ""
        for stylesheet_url in stylesheet_urls[:8]:
            css_status, css_type, css_body = _fetch_preview(stylesheet_url)
            stylesheet_results.append({"url": stylesheet_url, "status": css_status, "contentType": css_type, "bytes": len(css_body.encode("utf-8"))})
            if css_status == 200 and "css" in css_type.lower() and css_body:
                css_text += "\n" + css_body
        styles_ready = inline_styles > 0 or bool(css_text)
        has_background = bool(re.search(r"\bbody\s*\{[^}]*\bbackground(?:-color)?\s*:", document + css_text, flags=re.IGNORECASE | re.DOTALL))
        actions.append({"route": "/", "step": "verify-local-styles", "passed": styles_ready and has_background})
        if not styles_ready or not has_background:
            findings.append(_finding("visual", "Essential local CSS appears missing", "high", f"Found {inline_styles} inline styles and {len([item for item in stylesheet_results if item['status'] == 200])} usable local stylesheets.", "body", visual_evidence, ["Open the generated preview.", "Inspect local stylesheet delivery and body styling."]))
        overflow_values = [int(value) for value in re.findall(r"(?<![-\w])width\s*:\s*(\d+)px", document + css_text, flags=re.IGNORECASE) if int(value) > 375]
        actions.append({"route": "/", "step": "inspect-mobile-width-contract", "passed": not overflow_values})
        if overflow_values:
            findings.append(_finding("responsive", "Horizontal overflow at responsive viewport", "high", f"A fixed content width of {max(overflow_values)}px exceeds the 375px mobile viewport.", "document.documentElement", visual_evidence, ["Open the preview at 375×812.", "Inspect horizontal scrolling."]))
        trace = {"engine": "lightweight", "previewUrl": input_value.preview_url, "httpStatus": status, "contentType": content_type, "inlineStyles": inline_styles, "stylesheets": stylesheet_results, "actions": actions}
        (evidence_root / visual_trace_name).write_text(json.dumps(trace, indent=2), encoding="utf-8")
        (evidence_root / visual_name).write_text(json.dumps({"evaluator": "visual_synthetic_user", "engine": "lightweight", "actions": actions, "findings": findings}, indent=2), encoding="utf-8")
        payload["visual"] = {"evaluatorInstance": "visual_synthetic_user", "status": "FAILED" if findings else "PASS", "route": "/", "step": actions[-1]["step"], "actions": actions, "findings": findings, "evidencePaths": visual_evidence, "tracePath": f"evidence/evaluators/{visual_trace_name}", "consoleErrors": [], "networkFailures": []}
    return payload


def convert_run(instance: EvaluatorInstance, payload: dict[str, Any], started_at: str) -> EvaluatorRun:
    return EvaluatorRun(
        evaluator_instance=instance,
        status=payload.get("status", "SKIPPED"),
        started_at=started_at,
        completed_at=utc_now(),
        current_route=redact(str(payload.get("route"))) if payload.get("route") else None,
        current_step=redact(str(payload.get("step"))) if payload.get("step") else None,
        actions=payload.get("actions", []),
        evidence_paths=[relative_evidence(str(value)) for value in payload.get("evidencePaths", [])],
        screenshot_paths=[relative_evidence(str(value)) for value in payload.get("screenshotPaths", [])],
        trace_path=relative_evidence(str(payload["tracePath"])) if payload.get("tracePath") else None,
        console_errors=[redact(str(value)) for value in payload.get("consoleErrors", [])],
        network_failures=[redact(str(value)) for value in payload.get("networkFailures", [])],
        skip_reason=payload.get("skipReason"),
    )


def evaluate(input_value: EvaluatorInput) -> SyntheticEvaluation:
    evidence_root = Path(input_value.evidence_root).resolve()
    workspace_root = Path(input_value.workspace_root).resolve()
    if workspace_root not in evidence_root.parents:
        raise ValueError("SYNTHETIC_EVALUATION_SCOPE_INVALID")
    evidence_root.mkdir(parents=True, exist_ok=True)
    selected = input_value.evaluator
    engine = os.environ.get("SMARTBUILD_SYNTHETIC_EVALUATOR_ENGINE", "browser").strip().lower()
    if engine not in {"browser", "lightweight"}:
        raise ValueError("SYNTHETIC_EVALUATOR_ENGINE_INVALID")
    try:
        payload = (invoke_lightweight_runner(input_value) if engine == "lightweight" else invoke_browser_runner(input_value)) if input_value.preview_url else {"functional": {"status": "SKIPPED", "skipReason": "no_browser_preview"}, "visual": {"status": "SKIPPED", "skipReason": "no_browser_preview"}}
    except Exception as error:
        failed_instance = selected or EvaluatorInstance.FUNCTIONAL
        failed_key = "visual" if failed_instance == EvaluatorInstance.VISUAL else "functional"
        payload = {failed_key: {"status": "FAILED", "route": input_value.preview_url, "step": "runner-startup", "findings": [{"category": "visual" if failed_instance == EvaluatorInstance.VISUAL else "functional", "title": "Synthetic browser evaluator could not start", "severity": "high", "confidence": 1, "actualResult": redact(str(error)), "evidencePaths": ["evidence/evaluators/evaluator-runner-error.json"]}]}}
        if selected is None:
            payload["visual"] = {"status": "SKIPPED", "skipReason": "functional_evaluator_failed"}
        (evidence_root / "evaluator-runner-error.json").write_text(json.dumps({"error": redact(str(error))}, indent=2), encoding="utf-8")
    functional_payload = payload.get("functional") if selected in {None, EvaluatorInstance.FUNCTIONAL} else None
    visual_payload = payload.get("visual") if selected in {None, EvaluatorInstance.VISUAL} else None
    runs: list[EvaluatorRun] = []
    bugs: list[BugReport] = []
    if functional_payload is not None:
        functional_run = convert_run(EvaluatorInstance.FUNCTIONAL, functional_payload, utc_now())
        runs.append(functional_run)
        bugs.extend(bug_from_finding(input_value, EvaluatorInstance.FUNCTIONAL, item) for item in functional_payload.get("findings", []))
    if visual_payload is not None:
        visual_run = convert_run(EvaluatorInstance.VISUAL, visual_payload, utc_now())
        runs.append(visual_run)
        bugs.extend(bug_from_finding(input_value, EvaluatorInstance.VISUAL, item) for item in visual_payload.get("findings", []))
    bugs = deduplicate(bugs)
    repairs = create_repair_tasks(bugs)
    confirmed_blocker = any(bug.status != BugStatus.UNCONFIRMED and bug.severity in {BugSeverity.CRITICAL, BugSeverity.HIGH} for bug in bugs)
    final_status: Literal["PASS", "FAILED", "BLOCKED"] = "BLOCKED" if confirmed_blocker else "FAILED" if any(run.status == "FAILED" for run in runs) else "PASS"
    output_path = evidence_root / "synthetic-evaluation.json"
    # Medium and low findings remain visible and receive repair plans, but only
    # confirmed critical/high defects are a checkpoint gate.  This keeps the
    # policy aligned with the verified-build contract while avoiding a false
    # claim that non-blocking feedback has vanished.
    result = SyntheticEvaluation(runs=runs, bugs=bugs, repair_tasks=repairs, checkpoint_allowed=not confirmed_blocker, final_status=final_status, output_path="evidence/evaluators/synthetic-evaluation.json")
    output_path.write_text(result.model_dump_json(indent=2), encoding="utf-8")
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    args = parser.parse_args()
    test_delay_ms = os.environ.get("SMARTBUILD_SYNTHETIC_EVALUATOR_TEST_DELAY_MS")
    if os.environ.get("NODE_ENV") == "test" and test_delay_ms:
        time.sleep(min(max(float(test_delay_ms) / 1000, 0), 2))
    input_value = EvaluatorInput.model_validate_json(Path(args.input).read_text(encoding="utf-8"))
    try:
        result = evaluate(input_value)
        print(json.dumps({"ok": True, "evaluation": result.model_dump(mode="json")}, separators=(",", ":")))
    except Exception as error:
        print(json.dumps({"ok": False, "error": redact(str(error))}, separators=(",", ":")))
        raise SystemExit(1)


if __name__ == "__main__":
    main()
