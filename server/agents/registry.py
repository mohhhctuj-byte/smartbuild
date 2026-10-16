"""The single canonical 70-agent SmartBuild registry.

This module deliberately contains the only numbered-agent catalogue.  Model profiles,
tools, runtimes, and provider choices live outside this count.
"""
from __future__ import annotations

from typing import Type

from .additive_catalog import ADDITIVE_AGENT_COUNT, ADDITIVE_CATALOG, CANONICAL_AGENT_COUNT
from .additive_implementation_bindings import ADDITIVE_IMPLEMENTATION_CLASSES
from .agent_specs import AgentSpec
from .base import SpecialistAgent
from .implementation_bindings import IMPLEMENTATION_CLASSES


# (display name, legacy runtime module, team, role, trigger phrases, prerequisite legacy modules, risk)
_CATALOG: tuple[tuple[str, str, str, str, tuple[str, ...], tuple[str, ...], str], ...] = (
    ("User Clarifier Agent", "user_clarifier", "planning", "Requests material missing information.", ("unclear", "ambiguous", "not sure"), (), "low"),
    ("API Key Request Agent", "api_key_request", "governance", "Identifies configured-provider secret requirements.", ("api key", "provider", "stripe", "email", "external api"), ("intent_verifier",), "high"),
    ("Intent Verifier Agent", "intent_verifier", "planning", "Confirms requested outcome and constraints.", ("build", "create", "make", "implement"), (), "low"),
    ("Live Feedback Collector", "live_feedback_collector", "planning", "Creates review gates for collaborative or irreversible work.", ("feedback", "review", "approval", "collaborate"), ("intent_verifier",), "medium"),
    ("Functional Component Engineer", "functional_component_engineer", "frontend", "Builds functional interface behavior.", ("page", "form", "ui", "component", "landing"), ("intent_verifier",), "medium"),
    ("Dynamic Data Connector", "dynamic_data_connector", "backend", "Connects approved live data and persistence.", ("database", "sqlite", "persistence", "save", "data"), ("api_designer",), "high"),
    ("Form & Validation Master", "form_validation_master", "frontend", "Implements accessible client validation.", ("form", "validation", "contact", "input"), ("functional_component_engineer",), "medium"),
    ("Interactive Animation Specialist", "interactive_animation_specialist", "frontend", "Adds interaction-linked motion.", ("animation", "motion", "transition"), ("functional_component_engineer",), "low"),
    ("No-Fake Assurer", "no_fake_assurer", "governance", "Rejects placeholder behavior and fabricated completion.", ("build", "create", "implement", "verify"), ("functional_component_engineer",), "high"),
    ("Google Design Trends Searcher", "google_design_trends_searcher", "research", "Finds authorized current design references.", ("design trends", "inspiration"), ("intent_verifier",), "low"),
    ("Asset & Icon Finder", "asset_icon_finder", "research", "Finds licensed assets and icons.", ("icon", "asset", "image"), ("intent_verifier",), "low"),
    ("Competitor UI Scraper", "competitor_ui_scraper", "research", "Analyzes authorized competitor interfaces.", ("competitor", "reference site"), ("intent_verifier",), "medium"),
    ("Color Palette Scout", "color_palette_scout", "frontend", "Proposes accessible palettes.", ("color", "palette", "theme"), ("intent_verifier",), "low"),
    ("Browser Automation Agent", "browser_automation_agent", "quality", "Operates browser checks using approved Playwright tooling.", ("browser", "playwright", "e2e"), ("intent_verifier",), "medium"),
    ("Auto-Google Operator", "auto_google_operator", "research", "Performs authorized documentation searches.", ("search web", "google", "research"), ("intent_verifier",), "medium"),
    ("GUI & Mouse Navigator", "gui_mouse_navigator", "desktop", "Uses an explicit desktop automation layer when approved.", ("desktop", "mouse", "gui"), ("intent_verifier",), "high"),
    ("DOM Inspector & Scraper", "dom_inspector_scraper", "quality", "Inspects authorized DOM structures.", ("dom", "scrape html", "selector"), ("intent_verifier",), "medium"),
    ("System Environment Installer", "system_environment_installer", "operations", "Checks and installs dependencies only with approval.", ("install", "dependency", "environment"), ("intent_verifier",), "high"),
    ("Terminal Tester", "terminal_tester", "quality", "Runs bounded health and startup checks.", ("test", "terminal", "backend", "api"), ("intent_verifier",), "medium"),
    ("E2E User Simulator", "e2e_user_simulator", "quality", "Simulates user journeys.", ("user flow", "e2e", "journey"), ("intent_verifier",), "medium"),
    ("Microservices Architect", "microservices_architect", "architecture", "Plans service boundaries.", ("microservice", "services", "architecture"), ("intent_verifier",), "medium"),
    ("DB Schema Specialist", "db_schema_specialist", "backend", "Designs schemas and migrations.", ("database", "schema", "sqlite", "migration"), ("intent_verifier",), "high"),
    ("API Designer", "api_designer", "backend", "Designs endpoint contracts.", ("api", "endpoint", "post", "backend"), ("intent_verifier",), "high"),
    ("Security Architect", "security_architect", "security", "Reviews auth, authorization, and secret boundaries.", ("auth", "security", "backend", "database", "payment"), ("intent_verifier",), "high"),
    ("Performance Architect", "performance_architect", "architecture", "Plans latency and scaling constraints.", ("performance", "slow", "scale"), ("intent_verifier",), "medium"),
    ("Cloud Infra Specialist", "cloud_infra_specialist", "operations", "Plans deployment architecture without deployment.", ("deploy", "cloud", "hosting"), ("intent_verifier",), "high"),
    ("Event-Driven Specialist", "event_driven_specialist", "backend", "Designs events, queues, and webhooks.", ("webhook", "event", "queue", "realtime"), ("intent_verifier",), "high"),
    ("Legacy Refactoring Agent", "legacy_refactoring_agent", "quality", "Refactors while preserving behavior.", ("refactor", "legacy", "cleanup"), ("intent_verifier",), "medium"),
    ("Accessibility Expert", "accessibility_expert", "frontend", "Audits keyboard and WCAG behavior.", ("page", "ui", "form", "accessibility", "landing"), ("functional_component_engineer",), "medium"),
    ("Animation & CSS Master", "animation_css_master", "frontend", "Implements polished CSS and motion.", ("css", "style", "animation"), ("functional_component_engineer",), "low"),
    ("State Management Agent", "state_management_agent", "frontend", "Designs application state flows.", ("state", "store", "react state"), ("functional_component_engineer",), "medium"),
    ("SEO Specialist", "seo_specialist", "frontend", "Implements metadata and SEO checks.", ("seo", "metadata", "search ranking"), ("intent_verifier",), "low"),
    ("Responsive Designer", "responsive_designer", "frontend", "Verifies responsive layouts.", ("responsive", "mobile", "landing", "page", "ui"), ("functional_component_engineer",), "low"),
    ("Internationalization Agent", "internationalization_agent", "frontend", "Adds locale and translation architecture.", ("i18n", "translation", "locale", "arabic"), ("intent_verifier",), "medium"),
    ("Component Library Manager", "component_library_manager", "frontend", "Creates reusable interface components.", ("component", "design system", "ui library"), ("functional_component_engineer",), "medium"),
    ("Web Vitals Agent", "web_vitals_agent", "quality", "Improves loading and web vital measurements.", ("web vitals", "performance", "load"), ("intent_verifier",), "medium"),
    ("Auth & Permissions Agent", "auth_permissions_agent", "security", "Implements real authentication and authorization.", ("auth", "login", "permission", "role"), ("security_architect",), "high"),
    ("Payment Gateway Agent", "payment_gateway_agent", "integrations", "Integrates approved payment providers.", ("payment", "checkout", "stripe"), ("security_architect",), "high"),
    ("Query Optimizer", "query_optimizer", "backend", "Improves data queries.", ("query", "database", "slow query"), ("db_schema_specialist",), "medium"),
    ("WebSockets Agent", "websockets_agent", "backend", "Implements real-time state updates.", ("websocket", "realtime"), ("api_designer",), "high"),
    ("Caching Specialist", "caching_specialist", "backend", "Adds scoped cache plans.", ("cache", "caching"), ("performance_architect",), "medium"),
    ("Background Jobs Agent", "background_jobs_agent", "operations", "Implements approved background work.", ("cron", "scheduled", "background job"), ("intent_verifier",), "high"),
    ("Email & Notification Specialist", "email_notification_specialist", "integrations", "Integrates a configured delivery provider.", ("email", "notification", "send mail"), ("api_key_request",), "high"),
    ("Third-Party Integrator", "third_party_integrator", "integrations", "Connects approved external APIs.", ("integration", "third party", "external api"), ("api_key_request",), "high"),
    ("Unit Test Specialist", "unit_test_specialist", "quality", "Writes meaningful unit tests.", ("test", "unit test", "backend", "contact"), ("intent_verifier",), "medium"),
    ("E2E Test Agent", "e2e_test_agent", "quality", "Writes and runs browser tests.", ("playwright", "e2e", "browser test", "contact"), ("functional_component_engineer",), "medium"),
    ("Penetration Tester", "penetration_tester", "security", "Checks authorized common security issues.", ("penetration", "security test"), ("security_architect",), "high"),
    ("Load Tester", "load_tester", "quality", "Designs bounded load tests.", ("load test", "throughput"), ("performance_architect",), "high"),
    ("Edge Case Finder", "edge_case_finder", "quality", "Finds adverse inputs and failures.", ("edge case", "validation", "test"), ("intent_verifier",), "medium"),
    ("Code Smells Inspector", "code_smells_inspector", "quality", "Reviews maintainability.", ("code smell", "maintainability", "review"), ("intent_verifier",), "low"),
    ("API Regression Tester", "api_regression_tester", "quality", "Checks changed API behavior.", ("api", "endpoint", "regression", "contact"), ("api_designer",), "medium"),
    ("Mutation Tester", "mutation_tester", "quality", "Assesses whether tests detect defects.", ("mutation test",), ("unit_test_specialist",), "high"),
    ("Docker Master", "docker_master", "operations", "Creates secure Docker configurations.", ("docker", "container"), ("intent_verifier",), "high"),
    ("CI/CD Pipeline Agent", "ci_cd_pipeline_agent", "operations", "Creates validated CI workflows.", ("ci", "cd", "pipeline"), ("intent_verifier",), "high"),
    ("Infrastructure as Code Agent", "infrastructure_as_code_agent", "operations", "Generates infrastructure code for review.", ("terraform", "infrastructure"), ("intent_verifier",), "high"),
    ("Monitoring Agent", "monitoring_agent", "operations", "Integrates configured monitoring.", ("monitoring", "observability"), ("intent_verifier",), "high"),
    ("Kubernetes Agent", "kubernetes_agent", "operations", "Generates Kubernetes plans and manifests.", ("kubernetes", "k8s"), ("intent_verifier",), "high"),
    ("DNS & SSL Agent", "dns_ssl_agent", "operations", "Prepares domain and HTTPS configuration.", ("dns", "ssl", "domain"), ("intent_verifier",), "high"),
    ("Vector Database Agent", "vector_database_agent", "data", "Integrates vector stores when required.", ("vector database", "embeddings"), ("intent_verifier",), "high"),
    ("ETL Pipeline Agent", "etl_pipeline_agent", "data", "Designs data transformation workflows.", ("etl", "transform data", "pipeline"), ("intent_verifier",), "high"),
    ("Search Index Agent", "search_index_agent", "data", "Integrates a search index when required.", ("search index", "elasticsearch", "search"), ("intent_verifier",), "high"),
    ("Model Fine-Tuner", "model_fine_tuner", "ai", "Prepares fine-tuning data without training.", ("fine tune", "fine-tuning"), ("intent_verifier",), "high"),
    ("Analytics Specialist", "analytics_specialist", "governance", "Integrates privacy-aware analytics.", ("analytics", "metrics"), ("privacy_inspector",), "medium"),
    ("Scraper Agent", "scraper_agent", "research", "Collects authorized data with limits.", ("scrape", "crawler"), ("intent_verifier",), "high"),
    ("Tech Spec Writer", "tech_spec_writer", "documentation", "Creates technical specifications.", ("spec", "documentation", "api docs"), ("intent_verifier",), "low"),
    ("Cost & Token Optimizer", "cost_token_optimizer", "governance", "Reduces bounded model and service costs.", ("cost", "token", "budget"), ("intent_verifier",), "medium"),
    ("Privacy Inspector", "privacy_inspector", "governance", "Checks privacy, consent, and retention.", ("privacy", "gdpr", "consent"), ("intent_verifier",), "high"),
    ("Dependency Auditor", "dependency_auditor", "quality", "Audits dependency risk.", ("dependency", "vulnerability", "license"), ("intent_verifier",), "medium"),
    ("Changelog Agent", "changelog_agent", "documentation", "Writes release notes from verified changes.", ("changelog", "release notes", "release"), ("no_fake_assurer",), "low"),
    ("Prompt Engineering Agent", "prompt_engineer", "ai", "Improves prompts and evaluation cases.", ("prompt", "llm", "agent"), ("intent_verifier",), "medium"),
)


def _profile_for(team: str, risk: str) -> str:
    if team == "research":
        return "web_research"
    if team == "quality" or risk == "high":
        return "adversarial_review"
    if team in ("planning", "architecture", "governance"):
        return "deep_reasoning"
    return "precise_coding"


def _spec(index: int, row: tuple[str, str, str, str, tuple[str, ...], tuple[str, ...], str]) -> AgentSpec:
    name, legacy_module_id, team, role, triggers, prerequisite_modules, risk = row
    prereq_ids = tuple(f"agent_{_legacy_index(module):03d}" for module in prerequisite_modules)
    writes = ("project-root", "agent-artifacts") if team not in ("research", "planning", "governance") else ("agent-artifacts",)
    return AgentSpec(
        id=f"agent_{index:03d}", name=name, legacy_module_id=legacy_module_id, role=role, team=team,
        triggers=triggers, prerequisites=prereq_ids, required_inputs=("RequirementContract", "BuildContext"),
        produced_artifacts=(f"{legacy_module_id}-report",), read_scopes=("workspace", "build-evidence"), write_scopes=writes,
        allowed_tool_scopes=("workspace.read", "workspace.write"),
        allowed_path_scopes=(("project/**", "agent-artifacts/**") if "project-root" in writes else ("agent-artifacts/**",)), resource_locks=("project-write",),
        risk_level=risk, verification_methods=("structured-evidence", "agent-output-validation"),
        model_profile=_profile_for(team, risk), requires_secret=legacy_module_id in {"api_key_request", "payment_gateway_agent", "email_notification_specialist", "third_party_integrator"},
        requires_human_feedback=legacy_module_id == "live_feedback_collector",
    )


def _additive_spec(row: dict[str, object]) -> AgentSpec:
    agent_id = str(row["id"])
    source_role_id = str(row["source_id"])
    team = str(row["team"])
    risk = str(row["risk"])
    triggers = tuple(str(item) for item in row["triggers"])
    return AgentSpec(
        id=agent_id,
        name=str(row["name"]),
        legacy_module_id=str(row["legacy_module_id"]),
        role=str(row["role"]),
        team=team,
        triggers=triggers,
        prerequisites=("agent_003",),
        required_inputs=("RequirementContract", "BuildContext", "ScopedTask"),
        produced_artifacts=(str(row["output"]),),
        read_scopes=("workspace", "build-evidence", "requirement-contract"),
        write_scopes=("agent-artifacts",),
        allowed_tool_scopes=("workspace.read", "workspace.write"),
        allowed_path_scopes=("agent-artifacts/**",),
        resource_locks=("project-write",),
        risk_level=risk if risk in {"low", "medium", "high"} else "medium",
        verification_methods=("structured-evidence", "request-fingerprint", "scoped-artifact-exists"),
        model_profile=_profile_for(team, risk),
        source_role_id=source_role_id,
        source_tools_summary=str(row["source_tools"]),
    )


def _legacy_index(legacy_module_id: str) -> int:
    for index, row in enumerate(_CATALOG, start=1):
        if row[1] == legacy_module_id:
            return index
    raise KeyError(f"UNKNOWN_LEGACY_AGENT:{legacy_module_id}")


def _build_registry() -> dict[str, Type[SpecialistAgent]]:
    if len(_CATALOG) != 70:
        raise RuntimeError(f"EXPECTED_70_AGENT_ROWS:{len(_CATALOG)}")
    if len(ADDITIVE_CATALOG) != ADDITIVE_AGENT_COUNT or ADDITIVE_AGENT_COUNT != 230:
        raise RuntimeError(f"EXPECTED_230_ADDITIVE_AGENT_ROWS:{len(ADDITIVE_CATALOG)}")
    registry: dict[str, Type[SpecialistAgent]] = {}
    for index, row in enumerate(_CATALOG, start=1):
        spec = _spec(index, row)
        try:
            cls = IMPLEMENTATION_CLASSES[spec.id]
        except KeyError as exc:
            raise RuntimeError(f"CANONICAL_IMPLEMENTATION_MISSING:{spec.id}") from exc
        if not issubclass(cls, SpecialistAgent):
            raise RuntimeError(f"CANONICAL_IMPLEMENTATION_INVALID:{spec.id}")
        cls.spec = spec
        registry[spec.id] = cls
    for row in ADDITIVE_CATALOG:
        spec = _additive_spec(row)
        try:
            cls = ADDITIVE_IMPLEMENTATION_CLASSES[spec.id]
        except KeyError as exc:
            raise RuntimeError(f"ADDITIVE_IMPLEMENTATION_MISSING:{spec.id}") from exc
        if not issubclass(cls, SpecialistAgent):
            raise RuntimeError(f"ADDITIVE_IMPLEMENTATION_INVALID:{spec.id}")
        cls.spec = spec
        registry[spec.id] = cls
    expected = tuple(f"agent_{value:03d}" for value in range(1, CANONICAL_AGENT_COUNT + 1))
    additive_source_roles = {cls.spec.source_role_id for cls in tuple(registry.values())[70:]}
    if tuple(registry) != expected or len(registry) != CANONICAL_AGENT_COUNT or len(additive_source_roles) != ADDITIVE_AGENT_COUNT or None in additive_source_roles:
        raise RuntimeError("CANONICAL_AGENT_REGISTRY_INVALID")
    return registry


AGENT_REGISTRY: dict[str, Type[SpecialistAgent]] = _build_registry()


def get_agent(agent_id: str) -> SpecialistAgent:
    try:
        return AGENT_REGISTRY[agent_id]()
    except KeyError as exc:
        raise KeyError("AGENT_NOT_REGISTERED") from exc


def list_agents() -> tuple[SpecialistAgent, ...]:
    return tuple(cls() for cls in AGENT_REGISTRY.values())
