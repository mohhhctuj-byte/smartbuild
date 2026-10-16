"""Explicit discovery registry for the 70 named Veyra specialists."""
from __future__ import annotations

import importlib
import inspect
from typing import Type

try:
    from ..base_agent import BaseAgent
except ImportError:
    from base_agent import BaseAgent


AGENT_MODULE_IDS: tuple[str, ...] = (
    "user_clarifier", "api_key_request", "intent_verifier", "live_feedback_collector", "functional_component_engineer",
    "dynamic_data_connector", "form_validation_master", "interactive_animation_specialist", "no_fake_assurer", "google_design_trends_searcher",
    "asset_icon_finder", "competitor_ui_scraper", "color_palette_scout", "browser_automation_agent", "auto_google_operator",
    "gui_mouse_navigator", "dom_inspector_scraper", "system_environment_installer", "terminal_tester", "e2e_user_simulator",
    "microservices_architect", "db_schema_specialist", "api_designer", "security_architect", "performance_architect",
    "cloud_infra_specialist", "event_driven_specialist", "legacy_refactoring_agent", "accessibility_expert", "animation_css_master",
    "state_management_agent", "seo_specialist", "responsive_designer", "internationalization_agent", "component_library_manager",
    "web_vitals_agent", "auth_permissions_agent", "payment_gateway_agent", "query_optimizer", "websockets_agent",
    "caching_specialist", "background_jobs_agent", "email_notification_specialist", "third_party_integrator", "unit_test_specialist",
    "e2e_test_agent", "penetration_tester", "load_tester", "edge_case_finder", "code_smells_inspector", "api_regression_tester",
    "mutation_tester", "docker_master", "ci_cd_pipeline_agent", "infrastructure_as_code_agent", "monitoring_agent", "kubernetes_agent",
    "dns_ssl_agent", "vector_database_agent", "etl_pipeline_agent", "search_index_agent", "model_fine_tuner", "analytics_specialist",
    "scraper_agent", "tech_spec_writer", "cost_token_optimizer", "privacy_inspector", "dependency_auditor", "changelog_agent", "prompt_engineer",
)


def _discover() -> dict[str, Type[BaseAgent]]:
    found: dict[str, Type[BaseAgent]] = {}
    for module_id in AGENT_MODULE_IDS:
        module = importlib.import_module(f"{__package__}.{module_id}")
        classes = [value for _, value in inspect.getmembers(module, inspect.isclass) if issubclass(value, BaseAgent) and value is not BaseAgent]
        if len(classes) != 1:
            raise RuntimeError(f"AGENT_MODULE_MUST_EXPORT_ONE_CLASS:{module_id}")
        agent_class = classes[0]
        if agent_class.agent_id != module_id:
            raise RuntimeError(f"AGENT_ID_MISMATCH:{module_id}")
        found[agent_class.agent_id] = agent_class
    if len(found) != 70:
        raise RuntimeError(f"EXPECTED_70_AGENTS:{len(found)}")
    return found


AGENT_CLASSES = _discover()


def create_agent(agent_id: str) -> BaseAgent:
    try:
        return AGENT_CLASSES[agent_id]()
    except KeyError as exc:
        raise KeyError(f"SPECIALIST_NOT_REGISTERED:{agent_id}") from exc


def list_agents() -> tuple[BaseAgent, ...]:
    return tuple(cls() for cls in AGENT_CLASSES.values())
