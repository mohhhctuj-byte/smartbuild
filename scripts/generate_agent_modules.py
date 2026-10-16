from __future__ import annotations

from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
AGENTS = ROOT / "agent_runtime" / "agents"
DOCS = ROOT / "docs" / "agents"

RAW = [
("user_clarifier", "User Clarifier Agent", "planning", "asks targeted questions when a request is ambiguous"),
("api_key_request", "API Key Request Agent", "governance", "detects required APIs and requests missing configuration"),
("intent_verifier", "Intent Verifier Agent", "planning", "verifies that the requested outcome is clear and achievable"),
("live_feedback_collector", "Live Feedback Collector", "planning", "requests feedback after major milestones"),
("functional_component_engineer", "Functional Component Engineer", "frontend", "ensures controls have real events and backend behavior"),
("dynamic_data_connector", "Dynamic Data Connector", "backend", "replaces mock data with real database or API connections"),
("form_validation_master", "Form & Validation Master", "frontend", "creates validation, error handling, and feedback"),
("interactive_animation_specialist", "Interactive Animation Specialist", "frontend", "connects animation to real interactions"),
("no_fake_assurer", "No-Fake Assurer", "governance", "rejects visual-only or fabricated features"),
("google_design_trends_searcher", "Google Design Trends Searcher", "research", "researches current design references from authorized sources"),
("asset_icon_finder", "Asset & Icon Finder", "research", "finds assets with license metadata"),
("competitor_ui_scraper", "Competitor UI Scraper", "research", "analyzes authorized competitor interfaces"),
("color_palette_scout", "Color Palette Scout", "frontend", "proposes accessible color palettes"),
("browser_automation_agent", "Browser Automation Agent", "quality", "uses Playwright to operate and test browsers"),
("auto_google_operator", "Auto-Google Operator", "research", "performs authorized searches and extracts documentation"),
("gui_mouse_navigator", "GUI & Mouse Navigator", "desktop", "uses only an explicit safe desktop automation layer"),
("dom_inspector_scraper", "DOM Inspector & Scraper", "quality", "inspects authorized HTML and DOM structures"),
("system_environment_installer", "System Environment Installer", "operations", "checks dependencies and installs only with approval"),
("terminal_tester", "Terminal Tester", "quality", "runs local health checks and verifies startup"),
("e2e_user_simulator", "E2E User Simulator", "quality", "simulates visitors and reports broken flows"),
("microservices_architect", "Microservices Architect", "architecture", "plans service boundaries when needed"),
("db_schema_specialist", "DB Schema Specialist", "backend", "designs tables, relationships, indexes, and migrations"),
("api_designer", "API Designer", "backend", "creates REST or GraphQL contracts"),
("security_architect", "Security Architect", "security", "designs authentication, authorization, encryption, and secret handling"),
("performance_architect", "Performance Architect", "architecture", "plans latency, throughput, caching, and scaling"),
("cloud_infra_specialist", "Cloud Infra Specialist", "operations", "creates deployment architecture without deploying"),
("event_driven_specialist", "Event-Driven Specialist", "backend", "designs events, webhooks, queues, and realtime messaging"),
("legacy_refactoring_agent", "Legacy Refactoring Agent", "quality", "refactors while preserving behavior"),
("accessibility_expert", "Accessibility Expert", "frontend", "audits and improves WCAG and keyboard access"),
("animation_css_master", "Animation & CSS Master", "frontend", "implements polished CSS and motion systems"),
("state_management_agent", "State Management Agent", "frontend", "manages application state using the project library"),
("seo_specialist", "SEO Specialist", "frontend", "implements metadata, structured data, and SEO checks"),
("responsive_designer", "Responsive Designer", "frontend", "verifies desktop, tablet, and mobile layouts"),
("internationalization_agent", "Internationalization Agent", "frontend", "adds translation architecture and locale support"),
("component_library_manager", "Component Library Manager", "frontend", "creates reusable UI components"),
("web_vitals_agent", "Web Vitals Agent", "quality", "improves loading speed and Core Web Vitals"),
("auth_permissions_agent", "Auth & Permissions Agent", "security", "implements real authentication and authorization"),
("payment_gateway_agent", "Payment Gateway Agent", "integrations", "integrates approved payment providers securely"),
("query_optimizer", "Query Optimizer", "backend", "improves database queries and ORM usage"),
("websockets_agent", "WebSockets Agent", "backend", "implements realtime updates and reconnection"),
("caching_specialist", "Caching Specialist", "backend", "adds appropriate caching only when required"),
("background_jobs_agent", "Background Jobs Agent", "operations", "implements approved background work"),
("email_notification_specialist", "Email & Notification Specialist", "integrations", "integrates configured notification providers"),
("third_party_integrator", "Third-Party Integrator", "integrations", "connects external APIs with retries and validation"),
("unit_test_specialist", "Unit Test Specialist", "quality", "writes meaningful unit tests"),
("e2e_test_agent", "E2E Test Agent", "quality", "writes and runs real browser tests"),
("penetration_tester", "Penetration Tester", "security", "checks authorized common security issues"),
("load_tester", "Load Tester", "quality", "designs controlled load tests with explicit limits"),
("edge_case_finder", "Edge Case Finder", "quality", "identifies unexpected inputs and failure paths"),
("code_smells_inspector", "Code Smells Inspector", "quality", "reviews maintainability and complexity"),
("api_regression_tester", "API Regression Tester", "quality", "checks existing API behavior after changes"),
("mutation_tester", "Mutation Tester", "quality", "evaluates whether tests detect deliberate defects"),
("docker_master", "Docker Master", "operations", "creates secure Docker configuration when needed"),
("ci_cd_pipeline_agent", "CI/CD Pipeline Agent", "operations", "creates and validates CI workflows"),
("infrastructure_as_code_agent", "Infrastructure as Code Agent", "operations", "generates infrastructure code for review"),
("monitoring_agent", "Monitoring Agent", "operations", "integrates configured health monitoring"),
("kubernetes_agent", "Kubernetes Agent", "operations", "generates manifests and scaling plans without deploying"),
("dns_ssl_agent", "DNS & SSL Agent", "operations", "prepares domain, DNS, HTTPS, and certificate configuration"),
("vector_database_agent", "Vector Database Agent", "data", "integrates a vector database only when required"),
("etl_pipeline_agent", "ETL Pipeline Agent", "data", "cleans, transforms, validates, and loads data"),
("search_index_agent", "Search Index Agent", "data", "integrates a search index only when required"),
("model_fine_tuner", "Model Fine-Tuner", "ai", "prepares fine-tuning data without starting costly training"),
("analytics_specialist", "Analytics Specialist", "governance", "integrates privacy-aware analytics"),
("scraper_agent", "Scraper Agent", "research", "collects only authorized data with limits"),
("tech_spec_writer", "Tech Spec Writer", "documentation", "generates technical API documentation"),
("cost_token_optimizer", "Cost & Token Optimizer", "governance", "reduces model, API, compute, and storage costs"),
("privacy_inspector", "Privacy Inspector", "governance", "checks privacy, retention, consent, and GDPR requirements"),
("dependency_auditor", "Dependency Auditor", "quality", "scans licenses, vulnerabilities, and outdated packages"),
("changelog_agent", "Changelog Agent", "documentation", "generates release notes from verified changes"),
("prompt_engineer", "Prompt Engineer", "ai", "improves prompts, tool descriptions, and evaluation cases"),
]


def class_name(agent_id: str) -> str:
    return "".join(part.title() for part in agent_id.split("_")) + "Agent"


def profile(agent_id: str, name: str, team: str, description: str) -> tuple[tuple[str, ...], tuple[str, ...], tuple[str, ...], str, str, str]:
    tool_by_team = {
        "frontend": ("workspace.read", "workspace.write", "browser.preview"),
        "backend": ("workspace.read", "workspace.write", "database.inspect"),
        "quality": ("workspace.read", "terminal.check", "browser.test"),
        "security": ("workspace.read", "security.scan"),
        "research": ("web.search", "source.read"),
        "operations": ("workspace.read", "terminal.check"),
        "data": ("workspace.read", "database.inspect"),
        "integrations": ("workspace.read", "network.request"),
        "architecture": ("workspace.read",),
        "planning": ("workspace.read",),
        "governance": ("workspace.read", "policy.check"),
        "documentation": ("workspace.read", "workspace.write"),
        "ai": ("workspace.read", "prompt.inspect"),
        "desktop": ("desktop.bound-folder",),
    }
    tools = tool_by_team.get(team, ("workspace.read",))
    permissions = tuple("read-workspace" if tool == "workspace.read" else tool.replace(".", "-") for tool in tools)
    if any(word in agent_id for word in ("payment", "installer", "cloud", "kubernetes", "dns", "docker", "background_jobs", "fine_tuner", "scraper", "gui_mouse")):
        permissions = permissions + ("explicit-approval",)
    dependencies = () if team in ("planning", "research") else ("intent_verifier",)
    blocked = f"BLOCKED_{agent_id.upper()}_ADAPTER_OR_SCOPE_MISSING"
    validation = f"Validate {agent_id} evidence against the assigned paths and confirm the result addresses: {description}."
    example = f"For a Veyra website request, {name} uses {tools[0]} to {description} for the requested page, records role-specific evidence, and stops before any unapproved external or destructive action."
    return tools, permissions, dependencies, blocked, validation, example


def module_text(agent_id: str, name: str, team: str, description: str) -> str:
    cls = class_name(agent_id)
    tools, permissions, dependencies, blocked, validation, _example = profile(agent_id, name, team, description)
    return f'''"""Explicit implementation surface for {name}."""
from __future__ import annotations

try:
    from ..base_agent import BaseAgent
    from ..schemas import AgentContext, AgentResult, AgentStatus, TaskSpec
except ImportError:
    from base_agent import BaseAgent
    from schemas import AgentContext, AgentResult, AgentStatus, TaskSpec


class {cls}(BaseAgent):
    agent_id = "{agent_id}"
    name = "{name}"
    description = "{description.capitalize()}."
    team = "{team}"
    capabilities = ("{team}", "supervisor-gated")
    required_tools = {tools!r}
    required_permissions = {permissions!r}
    input_schema = {{"prompt": "string", "paths": "array", "approval": "optional"}}
    output_schema = {{"status": "agent-status", "summary": "string", "artifacts": "array"}}
    dependencies = {dependencies!r}
    high_risk = {"explicit-approval" in permissions!r}

    async def run(self, context: AgentContext, task: TaskSpec) -> AgentResult:
        if task.agent_id != self.agent_id:
            return AgentResult(status=AgentStatus.FAILED, agent_id=self.agent_id, run_id=context.run_id, failure_reason="TASK_AGENT_MISMATCH")
        if context.dry_run or task.dry_run:
            return AgentResult(status=AgentStatus.COMPLETED, agent_id=self.agent_id, run_id=context.run_id, summary=f"Dry run planned for {{self.name}}.")
        return AgentResult(status=AgentStatus.BLOCKED, agent_id=self.agent_id, run_id=context.run_id, blocked_reason="SPECIALIST_TOOL_ADAPTER_REQUIRED", summary=f"{{self.name}} is registered and supervisor-selected, but its scoped tool adapter is not configured.")
'''


def doc_text(agent_id: str, name: str, team: str, description: str) -> str:
    tools, permissions, dependencies, blocked, validation, example = profile(agent_id, name, team, description)
    return f'''# {name}

**Agent ID:** `{agent_id}`  
**Team:** `{team}`

## Responsibility

{description.capitalize()}.

## Supervisor activation

Activate `{agent_id}` only when the Supervisor identifies this responsibility in the request and assigns a bounded `{team}` task. The agent is never activated as part of an all-agent sweep.

## Inputs and outputs

The input is an `AgentContext` plus a `TaskSpec` containing the prompt, canonical workspace, attributed paths, and approved scopes. This role specifically consumes evidence needed to {description}. It returns an `AgentResult` with `planned`, `running`, `completed`, `blocked`, `failed`, or `cancelled` status.

## Dependencies and permissions

**Dependencies:** {", ".join(dependencies) if dependencies else "none beyond Supervisor assignment"}.  
**Tools:** {", ".join(tools)}.  
**Permissions:** {", ".join(permissions)}.  
These scopes are explicit and must be checked before invocation; high-risk actions require approval.

## Blocked conditions and validation

`{agent_id}` is blocked with `{blocked}` when its scoped adapter, required configuration, permission, approval, or canonical folder is unavailable. {validation} The output must contain no fabricated API or test result, and a completed result is not a checkpoint by itself.

## Concrete website-building example

{example}
'''


AGENTS.mkdir(parents=True, exist_ok=True)
DOCS.mkdir(parents=True, exist_ok=True)
(AGENTS / "__init__.py").write_text('"""Explicit specialist modules for Veyra."""\n', encoding="utf-8")
manifest = {}
for agent_id, name, team, description in RAW:
    tools, permissions, dependencies, blocked, validation, example = profile(agent_id, name, team, description)
    (AGENTS / f"{agent_id}.py").write_text(module_text(agent_id, name, team, description), encoding="utf-8")
    (DOCS / f"{agent_id}.md").write_text(doc_text(agent_id, name, team, description), encoding="utf-8")
    manifest[agent_id] = {"name": name, "team": team, "description": description, "tools": tools, "permissions": permissions, "dependencies": dependencies, "blocked_code": blocked, "validation": validation, "example": example}
assert len(RAW) == 70, len(RAW)
(DOCS / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
print(f"generated {len(RAW)} agent modules, documentation files, and manifest entries")
