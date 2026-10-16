"""Source and execution regressions for the explicit canonical Python registry."""
from __future__ import annotations

import inspect
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from .additive_catalog import ADDITIVE_CATALOG, CANONICAL_AGENT_COUNT, DEFERRED_SOURCE_ROLES
from .additive_implementation_bindings import ADDITIVE_IMPLEMENTATION_CLASSES
from .agent_specs import BuildContext, TaskDefinition, TaskStatus
from .builder_brain import build_builder_brain_contract
from .implementation_bindings import IMPLEMENTATION_CLASSES
from .registry import AGENT_REGISTRY, get_agent
from .execution_support import blocked, read_project_file, scoped_project_identity_marker, write_project_file
from .secret_requirements import requirement_for_request
from .supervisor import Supervisor


class CanonicalImplementationTests(unittest.TestCase):
    def test_builder_brain_ignores_explicitly_negated_capabilities(self) -> None:
        for request in (
            "Build a neighborhood tool-lending app with fictional listings. Frontend-only, with no backend or payments.",
            "Build a plant exchange with sample listings. Without a database, API, or external services.",
            "ابني تطبيق تبادل نباتات ببيانات تجريبية، بدون backend أو مدفوعات.",
        ):
            with self.subTest(request=request):
                contract = build_builder_brain_contract(
                    BuildContext(
                        run_id="negated-capabilities",
                        workspace_id="workspace-negated-capabilities",
                        workspace_root=".",
                        project_id=81,
                        conversation_id=82,
                        request=request,
                    )
                )
                self.assertEqual("frontend_build", contract.route)
                self.assertEqual("bounded-writer-supported", contract.capability_status)
                self.assertFalse(contract.approval_required)
                self.assertEqual((), requirement_for_request(request))

        backend_request = build_builder_brain_contract(
            BuildContext(
                run_id="required-backend",
                workspace_id="workspace-required-backend",
                workspace_root=".",
                project_id=83,
                conversation_id=84,
                request="Build a marketplace with a backend API and database persistence.",
            )
        )
        self.assertEqual("backend_build", backend_request.route)
        self.assertEqual("planned-only", backend_request.capability_status)
        self.assertTrue(requirement_for_request("Build payments with Stripe checkout."))
        self.assertEqual((), requirement_for_request("Build a mock Stripe checkout UI with demo data."))
        self.assertTrue(requirement_for_request("Build a live Stripe checkout with a mock-data fallback."))

    def test_neighborhood_marketplace_request_selects_page_writers_without_clarification(self) -> None:
        request = (
            "Build a neighborhood tool-lending app where residents can browse tools, "
            "filter by availability, and request a loan. Use fictional sample listings "
            "and keep it frontend-only, with no backend or payments."
        )
        context = BuildContext(
            run_id="neighborhood-tool-lending",
            workspace_id="workspace-neighborhood-tool-lending",
            workspace_root=".",
            project_id=85,
            conversation_id=86,
            request=request,
        )

        plan = Supervisor().plan(context)
        selected = {agent.id for agent in plan.selected_agents}

        self.assertFalse(Supervisor._needs_clarification(request))
        self.assertIsNone(plan.blocked_reason)
        self.assertTrue({"agent_003", "agent_005", "agent_030"}.issubset(selected))
        self.assertNotIn("agent_001", selected)
        self.assertTrue({"agent_006", "agent_021", "agent_022", "agent_023"}.isdisjoint(selected))

    def test_exactly_three_hundred_explicit_implementation_modules_are_registered(self) -> None:
        implementations_root = Path(__file__).parent / "implementations"
        legacy_modules = list(implementations_root.glob("agent_*.py"))
        additive_modules = list((implementations_root / "additive").glob("agent_*.py"))
        self.assertEqual(70, len(legacy_modules))
        self.assertEqual(230, len(additive_modules))
        self.assertEqual(tuple(f"agent_{number:03d}" for number in range(1, CANONICAL_AGENT_COUNT + 1)), tuple(AGENT_REGISTRY))
        self.assertEqual(70, len(IMPLEMENTATION_CLASSES))
        self.assertEqual(230, len(ADDITIVE_IMPLEMENTATION_CLASSES))
        self.assertEqual(230, len(ADDITIVE_CATALOG))
        self.assertEqual(10, len(DEFERRED_SOURCE_ROLES))
        self.assertEqual("PR-001", ADDITIVE_CATALOG[0]["source_id"])
        self.assertEqual("VOI-230", ADDITIVE_CATALOG[-1]["source_id"])
        self.assertEqual({f"EXP-{number:03d}" for number in range(231, 241)}, {row["source_id"] for row in DEFERRED_SOURCE_ROLES})
        for agent_id, cls in IMPLEMENTATION_CLASSES.items():
            self.assertTrue(cls.__module__.startswith("server.agents.implementations.agent_"), agent_id)
            self.assertIn("return ", inspect.getsource(cls.perform))
            self.assertNotIn("generated-project", cls.spec.allowed_path_scopes)
            if cls.spec.write_scopes:
                self.assertIn("agent-artifacts", cls.spec.write_scopes)
                self.assertIn("agent-artifacts/**", cls.spec.allowed_path_scopes)
                if "project-root" in cls.spec.write_scopes:
                    self.assertIn("project/**", cls.spec.allowed_path_scopes)
            else:
                self.assertEqual((), cls.spec.allowed_path_scopes)
        for agent_id, cls in ADDITIVE_IMPLEMENTATION_CLASSES.items():
            self.assertTrue(cls.__module__.startswith("server.agents.implementations.additive.agent_"), agent_id)
            self.assertIn("CatalogResponsibilityAgent", inspect.getsource(cls))
            self.assertEqual(("agent-artifacts",), cls.spec.write_scopes)
            self.assertEqual(("agent-artifacts/**",), cls.spec.allowed_path_scopes)
            self.assertIsNotNone(cls.spec.source_role_id)
            self.assertTrue(cls.spec.source_tools_summary)

    def test_each_agent_produces_scoped_evidence_or_an_honest_blocker(self) -> None:
        with tempfile.TemporaryDirectory() as workspace:
            context = BuildContext(
                run_id="run-test", workspace_id="workspace-test", workspace_root=workspace,
                project_id=1, conversation_id=2,
                request="Create a responsive contact page with a validated form.",
                granted_tool_scopes=("workspace.read", "workspace.write"), available_secrets=("configured-test-secret",),
                dry_run=False, metadata={"project_title": "Scoped test project"},
            )
            for agent_id, cls in AGENT_REGISTRY.items():
                task = TaskDefinition(
                    task_id=f"run-test:{agent_id}", agent_id=agent_id, title=cls.spec.name, purpose=cls.spec.role,
                    allowed_tool_scopes=cls.spec.allowed_tool_scopes, allowed_path_scopes=cls.spec.allowed_path_scopes,
                )
                execution, trace = get_agent(agent_id).run(context, task)
                self.assertNotEqual("SCOPED_EXECUTION_ADAPTER_REQUIRED", execution.blocked_reason)
                self.assertIn(execution.status, {TaskStatus.SUCCEEDED, TaskStatus.BLOCKED, TaskStatus.WAITING_FOR_SECRET, TaskStatus.WAITING_FOR_FEEDBACK, TaskStatus.WAITING_FOR_CLARIFICATION})
                self.assertTrue(execution.evidence_refs)
                self.assertEqual(agent_id, trace.agent_id)
                if execution.status == TaskStatus.SUCCEEDED:
                    self.assertTrue(execution.summary, agent_id)
                    self.assertTrue(execution.verification_report, agent_id)
                    evidence_file = Path(workspace) / execution.evidence_refs[0].split("#sha256:", 1)[0]
                    self.assertTrue(evidence_file.is_file(), agent_id)
                    evidence_payload = json.loads(evidence_file.read_text(encoding="utf-8"))
                    self.assertEqual(agent_id, evidence_payload["agentId"])
                    for changed_file in execution.changed_files:
                        self.assertTrue((Path(workspace) / changed_file).is_file(), f"{agent_id}: {changed_file}")
                    if agent_id in IMPLEMENTATION_CLASSES:
                        self.assertTrue(execution.changed_files, agent_id)
                        self.assertTrue(any(path.endswith(".md") for path in execution.changed_files), agent_id)
                        manifest_path = Path(workspace) / next(
                            path for path in execution.changed_files if path.endswith(".work-product.json")
                        )
                        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                        self.assertEqual("smartbuild-agent-work-product-v1", manifest["format"])
                        self.assertEqual("original-canonical", manifest["agentKind"])
                        self.assertEqual(agent_id, manifest["canonicalAgentId"])
                        self.assertEqual(task.task_id, manifest["buildScope"]["taskId"])
                        self.assertEqual([{"kind": "responsibility-report", "status": "completed"}], manifest["actions"])
                        self.assertEqual("not-performed", manifest["externalActions"])
                    if agent_id in ADDITIVE_IMPLEMENTATION_CLASSES:
                        self.assertTrue(execution.changed_files, agent_id)
                        manifest_path = Path(workspace) / next(
                            path for path in execution.changed_files if path.endswith(".work-product.json")
                        )
                        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                        self.assertEqual(agent_id, manifest["canonicalAgentId"])
                        self.assertEqual(("agent-artifacts/**",), tuple(manifest["buildScope"]["allowedPathScopes"]))
                else:
                    self.assertTrue(execution.blocked_reason or execution.status.value, agent_id)
                self.assertTrue((Path(workspace) / "evidence" / "agent-executions").is_dir())

    def test_blocked_evidence_normalizes_a_free_form_reason_before_writing(self) -> None:
        with tempfile.TemporaryDirectory() as workspace:
            context = BuildContext(
                run_id="blocked-safe", workspace_id="workspace-blocked-safe", workspace_root=workspace,
                project_id=81, conversation_id=82, request="Review scoped request.",
                granted_tool_scopes=("workspace.read",), dry_run=False,
            )
            agent = get_agent("agent_071")
            task = TaskDefinition(
                task_id="blocked-safe:agent_071", agent_id="agent_071", title="Product brief", purpose="Product",
                allowed_tool_scopes=agent.spec.allowed_tool_scopes, allowed_path_scopes=agent.spec.allowed_path_scopes,
            )
            execution = blocked(agent, context, task, "Product", "provider rejected recipient@example.test")
            self.assertEqual(TaskStatus.BLOCKED, execution.status)
            self.assertEqual("AGENT_TASK_BLOCKED", execution.blocked_reason)
            evidence_path = Path(workspace) / execution.evidence_refs[0].split("#sha256:", 1)[0]
            evidence_text = evidence_path.read_text(encoding="utf-8")
            self.assertNotIn("recipient@example.test", evidence_text)
            self.assertIn("AGENT_TASK_BLOCKED", evidence_text)

    def test_non_writer_read_scope_is_independent_from_write_scope(self) -> None:
        with tempfile.TemporaryDirectory() as workspace:
            root = Path(workspace)
            (root / "index.html").write_text("<main>Scoped source</main>", encoding="utf-8")
            evidence_dir = root / "evidence" / "agent-executions"
            evidence_dir.mkdir(parents=True)
            (evidence_dir / "prior-agent.json").write_text('{"status":"succeeded"}', encoding="utf-8")
            (root / "private-note.txt").write_text("must remain unreadable", encoding="utf-8")
            context = BuildContext(
                run_id="read-scope", workspace_id="workspace-read-scope", workspace_root=workspace,
                project_id=61, conversation_id=62, request="Create a page.",
                granted_tool_scopes=("workspace.read", "workspace.write"), dry_run=False,
            )
            task = TaskDefinition(
                task_id="read-scope:agent_009", agent_id="agent_009", title="No-Fake Assurer",
                purpose="Reject fabricated completion.", allowed_path_scopes=(),
                allowed_read_path_scopes=("index.html", "evidence/agent-executions/**"),
            )

            self.assertEqual("<main>Scoped source</main>", read_project_file(context, task, "index.html"))
            self.assertEqual('{"status":"succeeded"}', read_project_file(context, task, "evidence/agent-executions/prior-agent.json"))
            with self.assertRaisesRegex(RuntimeError, "AGENT_READ_PATH_OUTSIDE_TASK_SCOPE"):
                read_project_file(context, task, "private-note.txt")
            with self.assertRaisesRegex(RuntimeError, "MISSING_TASK_PATH_SCOPE"):
                write_project_file(context, task, "index.html", "<main>Attempted write</main>")

    def test_intent_verifier_writes_a_scoped_builder_brain_contract_for_supported_pages(self) -> None:
        with tempfile.TemporaryDirectory() as workspace:
            raw_request = "Create a portfolio page; never persist this literal request or secret-like value xyz123."
            context = BuildContext(
                run_id="brain-page", workspace_id="workspace-brain-page", workspace_root=workspace,
                project_id=61, conversation_id=62, request=raw_request,
                granted_tool_scopes=("workspace.read", "workspace.write"), dry_run=False,
                metadata={"project_title": "Scoped portfolio"},
            )
            agent = get_agent("agent_003")
            task = TaskDefinition(
                task_id="brain-page:agent_003", agent_id="agent_003", title=agent.spec.name,
                purpose=agent.spec.role, allowed_tool_scopes=agent.spec.allowed_tool_scopes,
                allowed_path_scopes=agent.spec.allowed_path_scopes,
            )
            execution, _trace = agent.run(context, task)
            self.assertEqual(TaskStatus.SUCCEEDED, execution.status)
            contract_path = Path(workspace) / "agent-artifacts/builder-brain/brain-page_agent_003.json"
            payload = json.loads(contract_path.read_text(encoding="utf-8"))
            self.assertEqual("smartbuild-builder-brain-contract-v1", payload["format"])
            self.assertEqual("website", payload["productType"])
            self.assertEqual("frontend_build", payload["route"])
            self.assertEqual("bounded-writer-supported", payload["capabilityStatus"])
            self.assertEqual(["index.html", "app.js", "styles.css"], payload["plannedFiles"])
            self.assertEqual("brain-page", payload["buildScope"]["buildRunId"])
            self.assertNotIn(raw_request, contract_path.read_text(encoding="utf-8"))
            self.assertNotIn("xyz123", contract_path.read_text(encoding="utf-8"))

    def test_intent_verifier_plans_games_without_claiming_an_unimplemented_writer(self) -> None:
        with tempfile.TemporaryDirectory() as workspace:
            context = BuildContext(
                run_id="brain-game", workspace_id="workspace-brain-game", workspace_root=workspace,
                project_id=63, conversation_id=64, request="Build a 2D browser game with restart and score.",
                granted_tool_scopes=("workspace.read", "workspace.write"), dry_run=False,
                metadata={"project_title": "Arcade concept"},
            )
            agent = get_agent("agent_003")
            task = TaskDefinition(
                task_id="brain-game:agent_003", agent_id="agent_003", title=agent.spec.name,
                purpose=agent.spec.role, allowed_tool_scopes=agent.spec.allowed_tool_scopes,
                allowed_path_scopes=agent.spec.allowed_path_scopes,
            )
            execution, _trace = agent.run(context, task)
            self.assertEqual(TaskStatus.BLOCKED, execution.status)
            self.assertEqual("UNSUPPORTED_IMPLEMENTATION_CAPABILITY", execution.blocked_reason)
            contract_path = Path(workspace) / "agent-artifacts/builder-brain/brain-game_agent_003.json"
            payload = json.loads(contract_path.read_text(encoding="utf-8"))
            self.assertEqual("game_2d", payload["productType"])
            self.assertEqual("game_2d_build", payload["route"])
            self.assertEqual("planned-only", payload["capabilityStatus"])
            self.assertIn("game.js", payload["plannedFiles"])
            self.assertIn("No game runtime writer is currently selected automatically.", payload["operatingRules"])

    def test_supervisor_selects_only_the_contract_agent_for_unimplemented_game_and_backend_routes(self) -> None:
        with tempfile.TemporaryDirectory() as workspace:
            for request in (
                "Build a 2D browser game with restart and score.",
                "Build a backend API with database persistence.",
            ):
                context = BuildContext(
                    run_id=f"unsupported-{len(request)}", workspace_id="workspace-unsupported", workspace_root=workspace,
                    project_id=71, conversation_id=72, request=request,
                    granted_tool_scopes=("workspace.read", "workspace.write"), dry_run=False,
                )
                plan = Supervisor().plan(context)
                self.assertEqual(("agent_003",), tuple(spec.id for spec in plan.selected_agents))
                self.assertEqual(("agent_003", "system.verification_gate", "system.checkpoint"), tuple(task.agent_id for task in plan.tasks))

    def test_runner_executes_one_selected_additive_production_agent_with_scoped_evidence(self) -> None:
        request = "Define the product strategy and brief for a subscription offering."
        with tempfile.TemporaryDirectory() as workspace:
            result = subprocess.run([
                sys.executable, "-m", "server.agents.runner", "--request", request,
                "--run-id", "runner-single", "--workspace-id", "workspace-single",
                "--project-id", "1", "--conversation-id", "2",
                "--workspace-root", workspace, "--trace-root", str(Path(workspace) / "evidence" / "agent-traces"),
                "--mode", "production", "--agent-id", "agent_071",
            ], check=True, cwd=Path(__file__).parents[2], capture_output=True, text=True, timeout=20)
            payload = json.loads(result.stdout)
            execution = payload["agentExecution"]
            self.assertEqual("production", execution["executionMode"])
            self.assertEqual("agent_071", execution["agentId"])
            self.assertEqual("succeeded", execution["status"])
            self.assertTrue((Path(workspace) / "agent-artifacts" / "pr-001" / "runner-single_agent_071.md").is_file())
            manifest_path = Path(workspace) / "agent-artifacts" / "pr-001" / "runner-single_agent_071.work-product.json"
            self.assertTrue(manifest_path.is_file())
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            self.assertEqual("agent_071", manifest["canonicalAgentId"])
            self.assertEqual("runner-single", manifest["buildScope"]["buildRunId"])
            self.assertTrue((Path(workspace) / "evidence" / "agent-executions" / "runner-single_agent_071.json").is_file())
            self.assertNotIn(request, result.stdout)

    def test_functional_component_engineer_writes_contract_identity_and_safe_scope_marker(self) -> None:
        requests = {
            "portfolio": (
                "Create a portfolio for <script>raw-request-must-not-appear</script>.",
                'Maya Noor Portfolio "Studio"',
            ),
            "restaurant": (
                "Create a restaurant landing page for Bella Tavola with raw-request-must-not-appear.",
                "Bella Tavola Restaurant",
            ),
        }
        with tempfile.TemporaryDirectory() as workspace:
            markers: dict[str, str] = {}
            for label, (request, title) in requests.items():
                project_root = Path(workspace) / label
                project_root.mkdir()
                context = BuildContext(
                    run_id=f"identity-{label}", workspace_id=f"workspace-{label}", workspace_root=str(project_root),
                    project_id=71, conversation_id=72, request=request,
                    granted_tool_scopes=("workspace.read", "workspace.write"), dry_run=False,
                    metadata={"project_title": title},
                )
                agent = get_agent("agent_005")
                task = TaskDefinition(
                    task_id=f"identity-{label}:agent_005", agent_id="agent_005", title=agent.spec.name, purpose=agent.spec.role,
                    allowed_tool_scopes=agent.spec.allowed_tool_scopes, allowed_path_scopes=agent.spec.allowed_path_scopes,
                )
                execution, _ = agent.run(context, task)
                self.assertEqual(TaskStatus.SUCCEEDED, execution.status)
                index = (project_root / "index.html").read_text(encoding="utf-8")
                marker = scoped_project_identity_marker(context)
                markers[label] = marker
                self.assertIn(f'<meta name="smartbuild-project-identity" content="{title.replace(chr(34), "&quot;")}">', index)
                self.assertIn(f'<meta name="smartbuild-build-scope" content="{marker}">', index)
                self.assertIn(f'<h1 id="project-identity" data-smartbuild-project-identity="visible" data-smartbuild-build-scope="{marker}">', index)
                self.assertNotIn("raw-request-must-not-appear", index)
                self.assertNotIn("<script>raw-request", index)
            self.assertNotEqual(markers["portfolio"], markers["restaurant"])

    def test_functional_component_engineer_writes_distinct_storefront_dashboard_and_product_profiles(self) -> None:
        requests = {
            "storefront": "Create an online storefront for a local maker.",
            "dashboard": "Build a dashboard for a product team.",
            "product": "Create a product landing page for a planning tool.",
        }
        source: dict[str, str] = {}
        with tempfile.TemporaryDirectory() as workspace:
            for label, request in requests.items():
                project_root = Path(workspace) / label
                project_root.mkdir()
                context = BuildContext(
                    run_id=f"profile-{label}", workspace_id=f"workspace-{label}", workspace_root=str(project_root),
                    project_id=73, conversation_id=74, request=request,
                    granted_tool_scopes=("workspace.read", "workspace.write"), dry_run=False,
                    metadata={"project_title": f"Scoped {label.title()}"},
                )
                agent = get_agent("agent_005")
                task = TaskDefinition(
                    task_id=f"profile-{label}:agent_005", agent_id="agent_005", title=agent.spec.name, purpose=agent.spec.role,
                    allowed_tool_scopes=agent.spec.allowed_tool_scopes, allowed_path_scopes=agent.spec.allowed_path_scopes,
                )
                execution, _ = agent.run(context, task)
                self.assertEqual(TaskStatus.SUCCEEDED, execution.status)
                source[label] = (project_root / "index.html").read_text(encoding="utf-8")
                app = (project_root / "app.js").read_text(encoding="utf-8")
                self.assertIn(f"dataset.buildProfile = '{label}'", app)
                self.assertNotIn("fetch(", app)

        self.assertIn("Storefront collection", source["storefront"])
        self.assertIn("Checkout and payment processing are not configured", source["storefront"])
        self.assertIn("Workspace overview", source["dashboard"])
        self.assertIn("No live analytics are shown", source["dashboard"])
        self.assertIn("Product brief", source["product"])
        self.assertIn("No external service has been connected", source["product"])
        self.assertEqual(3, len(set(source.values())))

    def test_functional_component_engineer_builds_a_modular_24_member_reading_club(self) -> None:
        request = "ابني موقع نادي قراءة أونلاين بسيطًا لـ24 عضوًا، يساعدهم على تنظيم الاجتماعات والكتب التي يقرؤونها."
        with tempfile.TemporaryDirectory() as workspace:
            context = BuildContext(
                run_id="profile-reading-club", workspace_id="workspace-reading-club", workspace_root=workspace,
                project_id=77, conversation_id=78, request=request,
                granted_tool_scopes=("workspace.read", "workspace.write"), dry_run=False,
            )
            agent = get_agent("agent_005")
            task = TaskDefinition(
                task_id="profile-reading-club:agent_005", agent_id="agent_005", title=agent.spec.name,
                purpose=agent.spec.role, allowed_tool_scopes=agent.spec.allowed_tool_scopes,
                allowed_path_scopes=agent.spec.allowed_path_scopes,
            )

            execution, _ = agent.run(context, task)
            project_root = Path(workspace)
            html = (project_root / "index.html").read_text(encoding="utf-8")
            app = (project_root / "app.js").read_text(encoding="utf-8")
            club_data = (project_root / "src" / "data" / "club-data.mjs").read_text(encoding="utf-8")

            self.assertEqual(TaskStatus.SUCCEEDED, execution.status)
            self.assertGreaterEqual(len(execution.changed_files), 14)
            self.assertIn("<title>Reading Club</title>", html)
            self.assertIn('data-product-category="social_network"', html)
            self.assertIn('id="book-search"', html)
            self.assertIn('id="meeting-panel"', html)
            self.assertIn("dataset.buildProfile = 'reading-club'", app)
            self.assertIn("CLUB_SIZE = 24", club_data)
            self.assertTrue((project_root / "tests" / "club-state.test.mjs").is_file())
            self.assertTrue((project_root / "README.md").is_file())
            self.assertNotIn("fetch(", app)
            node_result = subprocess.run(
                ["node", "--test", "tests/club-state.test.mjs"],
                cwd=workspace,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(0, node_result.returncode, node_result.stderr)

    def test_functional_component_engineer_builds_a_cafe_menu_and_local_pickup_order(self) -> None:
        request = (
            "Build a polished website for a neighborhood café called Cedar & Steam. "
            "Design it for exactly three user groups: walk-in guests, takeout customers, "
            "and café staff. Include the menu, opening hours and location, plus a simple "
            "working way to place an order. Make it a real, usable site rather than a static mockup."
        )
        with tempfile.TemporaryDirectory() as workspace:
            context = BuildContext(
                run_id="profile-cafe", workspace_id="workspace-cafe", workspace_root=workspace,
                project_id=77, conversation_id=78, request=request,
                granted_tool_scopes=("workspace.read", "workspace.write"), dry_run=False,
                metadata={"project_title": "Cedar & Steam"},
            )
            agent = get_agent("agent_005")
            task = TaskDefinition(
                task_id="profile-cafe:agent_005", agent_id="agent_005", title=agent.spec.name,
                purpose=agent.spec.role, allowed_tool_scopes=agent.spec.allowed_tool_scopes,
                allowed_path_scopes=agent.spec.allowed_path_scopes,
            )

            execution, _ = agent.run(context, task)
            project_root = Path(workspace)
            html = (project_root / "index.html").read_text(encoding="utf-8")
            app = (project_root / "app.js").read_text(encoding="utf-8")
            page = (project_root / "src" / "pages" / "cafe-page.mjs").read_text(encoding="utf-8")
            order_state = (project_root / "src" / "state" / "order-state.mjs").read_text(encoding="utf-8")

            self.assertEqual(TaskStatus.SUCCEEDED, execution.status)
            self.assertGreaterEqual(len(execution.changed_files), 8)
            self.assertIn("<title>Cedar &amp; Steam</title>", html)
            self.assertIn('href="#primary-section"', html)
            self.assertIn('id="primary-section"', html)
            self.assertIn('id="menu-items"', html)
            self.assertIn('id="audience-groups"', html)
            self.assertIn("Walk-in guests", html)
            self.assertIn("Takeout customers", html)
            self.assertIn("Café staff", html)
            self.assertIn("125 Market Street", html)
            self.assertIn("import { renderCafePage }", app)
            self.assertIn("createOrderState", page)
            self.assertIn("placeOrder()", order_state)
            self.assertTrue((project_root / "src" / "data" / "cafe-menu.mjs").is_file())
            self.assertTrue((project_root / "tests" / "order-state.test.mjs").is_file())
            node_result = subprocess.run(
                ["node", "--test", "tests/order-state.test.mjs"],
                cwd=workspace,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(0, node_result.returncode, node_result.stdout + node_result.stderr)

    def test_functional_component_engineer_builds_a_tested_tool_lending_library(self) -> None:
        request = (
            "Build a neighborhood tool-lending app where residents can browse tools, "
            "filter by category and availability, and prepare a loan request. Use fictional "
            "sample listings, keep requests local, and do not add a backend or payments. "
        )
        with tempfile.TemporaryDirectory() as workspace:
            context = BuildContext(
                run_id="profile-tool-lending", workspace_id="workspace-tool-lending", workspace_root=workspace,
                project_id=81, conversation_id=82, request=request,
                granted_tool_scopes=("workspace.read", "workspace.write"), dry_run=False,
            )
            agent = get_agent("agent_005")
            initial_task = TaskDefinition(
                task_id="profile-tool-lending:agent_005", agent_id="agent_005", title=agent.spec.name,
                purpose=agent.spec.role, allowed_tool_scopes=agent.spec.allowed_tool_scopes,
                allowed_path_scopes=agent.spec.allowed_path_scopes,
            )
            initial_execution, _ = agent.run(context, initial_task)
            self.assertEqual(TaskStatus.SUCCEEDED, initial_execution.status)

            first_edit_request = (
                f"Update the existing project from this complete request: {request} "
                "Keep its existing functionality and visual direction. Add this user-requested change: "
                "In the tool library you just built, add one new fictional available tool listing for a step ladder. "
                "Make it show in search and the availability filters, and keep the existing listings, request flow, "
                "and layout unchanged."
            )
            edit_context = BuildContext(
                run_id="profile-tool-lending-edit", workspace_id="workspace-tool-lending", workspace_root=workspace,
                project_id=81, conversation_id=82,
                request=first_edit_request,
                granted_tool_scopes=("workspace.read", "workspace.write"), dry_run=False,
            )
            first_edit_task = TaskDefinition(
                task_id="profile-tool-lending-edit:agent_005", agent_id="agent_005", title=agent.spec.name,
                purpose=agent.spec.role, allowed_tool_scopes=agent.spec.allowed_tool_scopes,
                allowed_path_scopes=agent.spec.allowed_path_scopes,
            )
            first_edit_execution, _ = agent.run(edit_context, first_edit_task)
            self.assertEqual(TaskStatus.SUCCEEDED, first_edit_execution.status)

            second_edit_request = (
                f"Update the existing project from this complete request: {first_edit_request} "
                "Add one new fictional available tool listing for a hand cultivator. Make it searchable and filterable, "
                "and preserve the step ladder addition and all existing interactions."
            )
            second_edit_context = BuildContext(
                run_id="profile-tool-lending-edit-2", workspace_id="workspace-tool-lending", workspace_root=workspace,
                project_id=81, conversation_id=82, request=second_edit_request,
                granted_tool_scopes=("workspace.read", "workspace.write"), dry_run=False,
            )
            second_edit_task = TaskDefinition(
                task_id="profile-tool-lending-edit-2:agent_005", agent_id="agent_005", title=agent.spec.name,
                purpose=agent.spec.role, allowed_tool_scopes=agent.spec.allowed_tool_scopes,
                allowed_path_scopes=agent.spec.allowed_path_scopes,
            )
            second_edit_execution, _ = agent.run(second_edit_context, second_edit_task)
            self.assertEqual(TaskStatus.SUCCEEDED, second_edit_execution.status)

            third_edit_context = BuildContext(
                run_id="profile-tool-lending-edit-3", workspace_id="workspace-tool-lending", workspace_root=workspace,
                project_id=81, conversation_id=82,
                request=(
                    f"Update the existing project from this complete request: {second_edit_request} "
                    "Add this change: في مكتبة الأدوات اللي بنيتها، ضيف أداة جديدة باسم كشاف متاح للإعارة "
                    "وخليه يظهر في البحث والفلاتر، وحافظ على كل الأدوات وطلبات الإعارة السابقة."
                ),
                granted_tool_scopes=("workspace.read", "workspace.write"), dry_run=False,
            )
            task = TaskDefinition(
                task_id="profile-tool-lending-edit-3:agent_005", agent_id="agent_005", title=agent.spec.name,
                purpose=agent.spec.role, allowed_tool_scopes=agent.spec.allowed_tool_scopes,
                allowed_path_scopes=agent.spec.allowed_path_scopes,
            )

            execution, _ = agent.run(third_edit_context, task)
            project_root = Path(workspace)
            html = (project_root / "index.html").read_text(encoding="utf-8")
            app = (project_root / "app.js").read_text(encoding="utf-8")
            tool_data = (project_root / "src" / "data" / "tools.mjs").read_text(encoding="utf-8")
            state = (project_root / "src" / "state" / "tool-library.mjs").read_text(encoding="utf-8")

            self.assertEqual(TaskStatus.SUCCEEDED, execution.status)
            self.assertGreaterEqual(len(execution.changed_files), 10)
            self.assertIn('<h1 id="project-identity"', html)
            self.assertIn("Neighborhood Tool Share", html)
            self.assertIn('id="tool-search"', html)
            self.assertIn('id="tool-category"', html)
            self.assertIn('id="tool-availability"', html)
            self.assertIn('id="loan-list"', html)
            self.assertIn("dataset.buildProfile = 'tool-lending'", app)
            self.assertGreaterEqual(tool_data.count("{ id:"), 8)
            self.assertIn("setSearch", state)
            self.assertIn("setCategory", state)
            self.assertIn("setAvailability", state)
            self.assertIn("requestLoan", state)
            self.assertIn('"name": "Step Ladder"', tool_data)
            self.assertIn('"name": "Hand Cultivator"', tool_data)
            self.assertIn('"name": "كشاف"', tool_data)
            self.assertEqual(3, tool_data.count('"id": "requested-'))
            tool_tests = (project_root / "tests" / "tool-library.test.mjs").read_text(encoding="utf-8")
            self.assertIn('requested Step Ladder addition is searchable and available', tool_tests)
            self.assertIn('requested Hand Cultivator addition is searchable and available', tool_tests)
            self.assertIn('requested كشاف addition is searchable and available', tool_tests)
            self.assertTrue((project_root / "src" / "components" / "tool-card.mjs").is_file())
            self.assertTrue((project_root / "src" / "pages" / "tool-library.mjs").is_file())
            self.assertTrue((project_root / "tests" / "tool-library.test.mjs").is_file())
            self.assertNotIn("fetch(", app)

            design_agent = get_agent("agent_030")
            design_task = TaskDefinition(
                task_id="profile-tool-lending-edit-3:agent_030", agent_id="agent_030", title=design_agent.spec.name,
                purpose=design_agent.spec.role, allowed_tool_scopes=design_agent.spec.allowed_tool_scopes,
                allowed_path_scopes=design_agent.spec.allowed_path_scopes,
            )
            design_execution, _ = design_agent.run(third_edit_context, design_task)
            css = (project_root / "styles.css").read_text(encoding="utf-8")
            self.assertEqual(TaskStatus.SUCCEEDED, design_execution.status)
            self.assertIn(".tool-lending-grid", css)
            self.assertIn(".tool-card", css)
            self.assertIn(".tool-lending-grid", css[css.index("@media"):])

            node_result = subprocess.run(
                ["node", "--test", "tests/tool-library.test.mjs"],
                cwd=workspace,
                capture_output=True,
                text=True,
                encoding="utf-8",
                check=False,
            )
            self.assertEqual(0, node_result.returncode, node_result.stdout + node_result.stderr)

    def test_functional_component_engineer_applies_a_requested_book_title_update(self) -> None:
        request = "في موقع نادي القراءة، غيّر عنوان الكتاب The Quiet Atlas إلى The Glass Orchard في كل مكان يظهر فيه، وحافظ على البحث والتقدم وRSVP."
        with tempfile.TemporaryDirectory() as workspace:
            context = BuildContext(
                run_id="update-reading-club-book", workspace_id="workspace-reading-club", workspace_root=workspace,
                project_id=79, conversation_id=80, request=request,
                granted_tool_scopes=("workspace.read", "workspace.write"), dry_run=False,
            )
            agent = get_agent("agent_005")
            task = TaskDefinition(
                task_id="update-reading-club-book:agent_005", agent_id="agent_005", title=agent.spec.name,
                purpose=agent.spec.role, allowed_tool_scopes=agent.spec.allowed_tool_scopes,
                allowed_path_scopes=agent.spec.allowed_path_scopes,
            )

            execution, _ = agent.run(context, task)
            data = (Path(workspace) / "src" / "data" / "club-data.mjs").read_text(encoding="utf-8")

            self.assertEqual(TaskStatus.SUCCEEDED, execution.status)
            self.assertIn("The Glass Orchard", data)
            self.assertNotIn("The Quiet Atlas", data)

    def test_animation_css_master_styles_storefront_dashboard_and_product_profiles(self) -> None:
        requests = {
            "storefront": "Create an online storefront for a local maker.",
            "dashboard": "Build a dashboard for a product team.",
            "product": "Create a product landing page for a planning tool.",
            "reading-club": "Build an online reading club for 24 members.",
        }
        styles: dict[str, str] = {}
        with tempfile.TemporaryDirectory() as workspace:
            for label, request in requests.items():
                project_root = Path(workspace) / label
                project_root.mkdir()
                context = BuildContext(
                    run_id=f"css-{label}", workspace_id=f"workspace-css-{label}", workspace_root=str(project_root),
                    project_id=75, conversation_id=76, request=request,
                    granted_tool_scopes=("workspace.read", "workspace.write"), dry_run=False,
                    metadata={"project_title": f"Scoped {label.title()}"},
                )
                agent = get_agent("agent_030")
                task = TaskDefinition(
                    task_id=f"css-{label}:agent_030", agent_id="agent_030", title=agent.spec.name,
                    purpose=agent.spec.role, allowed_tool_scopes=agent.spec.allowed_tool_scopes,
                    allowed_path_scopes=agent.spec.allowed_path_scopes,
                )
                execution, _ = agent.run(context, task)
                self.assertEqual(TaskStatus.SUCCEEDED, execution.status)
                styles[label] = (project_root / "styles.css").read_text(encoding="utf-8")

        self.assertIn("body[data-site-profile=storefront] .profile-grid{grid-template-columns:1.25fr .75fr}", styles["storefront"])
        self.assertIn("body[data-site-profile=dashboard] .hero{border-radius:.55rem}", styles["dashboard"])
        self.assertIn("#633f8a", styles["product"])
        self.assertIn(".club-summary{display:grid", styles["reading-club"])
        self.assertEqual(4, len(set(styles.values())))

    def test_animation_css_master_preserves_existing_design_and_applies_requested_theme_edits(self) -> None:
        with tempfile.TemporaryDirectory() as workspace:
            project_root = Path(workspace)

            def run_design(run_id: str, request: str) -> str:
                context = BuildContext(
                    run_id=run_id, workspace_id="workspace-design-iteration", workspace_root=workspace,
                    project_id=75, conversation_id=76, request=request,
                    granted_tool_scopes=("workspace.read", "workspace.write"), dry_run=False,
                    metadata={"project_title": "Design iteration"},
                )
                agent = get_agent("agent_030")
                task = TaskDefinition(
                    task_id=f"{run_id}:agent_030", agent_id="agent_030", title=agent.spec.name,
                    purpose=agent.spec.role, allowed_tool_scopes=agent.spec.allowed_tool_scopes,
                    allowed_path_scopes=agent.spec.allowed_path_scopes,
                )
                execution, _ = agent.run(context, task)
                self.assertEqual(TaskStatus.SUCCEEDED, execution.status)
                return (project_root / "styles.css").read_text(encoding="utf-8")

            initial = run_design("design-create", "Create an online storefront for a local maker.")
            custom_css = "\n.custom-brand-mark{letter-spacing:.2em}\n"
            stylesheet = project_root / "styles.css"
            stylesheet.write_text(initial + custom_css, encoding="utf-8")

            green = run_design("design-green", "غير لون الموقع إلى الأخضر مع الحفاظ على التنسيق.")
            self.assertIn(custom_css, green)
            self.assertIn("--smartbuild-accent:#16815d", green)
            self.assertIn("SmartBuild responsive and accessibility finish", green)

            updated = run_design("design-follow-up", "Add a small catalog detail without changing the design.")
            self.assertEqual(green, updated)

            purple = run_design("design-purple", "Change the theme to purple.")
            self.assertIn("--smartbuild-accent:#7c3aed", purple)
            self.assertNotIn("--smartbuild-accent:#16815d", purple)
            self.assertIn(custom_css, purple)

    def test_selected_frontend_reviewers_inspect_scoped_source_and_block_when_it_is_absent(self) -> None:
        with tempfile.TemporaryDirectory() as workspace:
            context = BuildContext(
                run_id="review-source", workspace_id="workspace-review-source", workspace_root=workspace,
                project_id=91, conversation_id=92, request="Create a responsive portfolio landing page.",
                granted_tool_scopes=("workspace.read", "workspace.write"), dry_run=False,
                metadata={"project_title": "Scoped review source"},
            )

            def run_agent(agent_id: str):
                agent = get_agent(agent_id)
                task = TaskDefinition(
                    task_id=f"review-source:{agent_id}", agent_id=agent_id, title=agent.spec.name,
                    purpose=agent.spec.role, allowed_tool_scopes=agent.spec.allowed_tool_scopes,
                    allowed_path_scopes=agent.spec.allowed_path_scopes,
                )
                return agent.run(context, task)[0]

            for reviewer_id in ("agent_029", "agent_033"):
                absent_execution = run_agent(reviewer_id)
                self.assertEqual(TaskStatus.BLOCKED, absent_execution.status)
                self.assertEqual("SCOPED_SOURCE_NOT_AVAILABLE", absent_execution.blocked_reason)

            self.assertEqual(TaskStatus.SUCCEEDED, run_agent("agent_005").status)
            self.assertEqual(TaskStatus.SUCCEEDED, run_agent("agent_030").status)
            for reviewer_id in ("agent_029", "agent_033"):
                reviewed_execution = run_agent(reviewer_id)
                self.assertEqual(TaskStatus.SUCCEEDED, reviewed_execution.status)
                self.assertTrue(reviewed_execution.evidence_refs)
                self.assertTrue(any("source inspection" in line for line in reviewed_execution.logs))

    def test_no_fake_assurer_inspects_only_available_functional_source_and_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as workspace:
            context = BuildContext(
                run_id="no-fake", workspace_id="workspace-no-fake", workspace_root=workspace,
                project_id=93, conversation_id=94, request="Create a portfolio landing page.",
                granted_tool_scopes=("workspace.read", "workspace.write"), dry_run=False,
                metadata={"project_title": "Scoped no-fake review"},
            )
            functional = get_agent("agent_005")
            functional_task = TaskDefinition(
                task_id="no-fake:agent_005", agent_id="agent_005", title=functional.spec.name,
                purpose=functional.spec.role, allowed_tool_scopes=functional.spec.allowed_tool_scopes,
                allowed_path_scopes=functional.spec.allowed_path_scopes,
            )
            assurer = get_agent("agent_009")
            assurer_task = TaskDefinition(
                task_id="no-fake:agent_009", agent_id="agent_009", title=assurer.spec.name,
                purpose=assurer.spec.role, allowed_tool_scopes=assurer.spec.allowed_tool_scopes,
                allowed_path_scopes=assurer.spec.allowed_path_scopes,
                allowed_read_path_scopes=("index.html", "app.js", "evidence/agent-executions/**"),
            )

            absent, _ = assurer.run(context, assurer_task)
            self.assertEqual(TaskStatus.BLOCKED, absent.status)
            self.assertEqual("SCOPED_SOURCE_NOT_AVAILABLE", absent.blocked_reason)

            self.assertEqual(TaskStatus.SUCCEEDED, functional.run(context, functional_task)[0].status)
            verified, _ = assurer.run(context, assurer_task)
            self.assertEqual(TaskStatus.SUCCEEDED, verified.status)
            verified_evidence_path = Path(workspace) / verified.evidence_refs[0].split("#sha256:", 1)[0]
            verified_evidence = json.loads(verified_evidence_path.read_text(encoding="utf-8"))
            self.assertIn("Verified matching functional-agent execution evidence.", verified_evidence["findings"])

            app_path = Path(workspace) / "app.js"
            app_path.write_text("fetch('https://not-configured.example.test')", encoding="utf-8")
            blocked_execution, _ = assurer.run(context, assurer_task)
            self.assertEqual(TaskStatus.BLOCKED, blocked_execution.status)
            self.assertEqual("AGENT_TASK_BLOCKED", blocked_execution.blocked_reason)

    def test_page_plan_orders_no_fake_after_functional_writer_without_selecting_it_for_api_only_work(self) -> None:
        from .supervisor import Supervisor

        context = BuildContext(
            run_id="no-fake-plan", workspace_id="workspace-no-fake-plan", workspace_root=".",
            project_id=95, conversation_id=96, request="Build a responsive portfolio landing page.",
            granted_tool_scopes=("workspace.read", "workspace.write"), dry_run=True,
        )
        plan = Supervisor().plan(context)
        ordered_ids = [task.agent_id for task in plan.tasks]
        no_fake_task = next(task for task in plan.tasks if task.agent_id == "agent_009")
        self.assertLess(ordered_ids.index("agent_005"), ordered_ids.index("agent_009"))
        self.assertEqual(("agent-artifacts/**",), no_fake_task.allowed_path_scopes)
        self.assertEqual(
            ("index.html", "app.js", "styles.css", "form-validation.js", "evidence/agent-executions/**"),
            no_fake_task.allowed_read_path_scopes,
        )
        self.assertNotIn("agent_009", Supervisor()._selected_ids("Build an API endpoint with validation."))

    def test_additive_team_work_products_are_responsibility_specific(self) -> None:
        with tempfile.TemporaryDirectory() as workspace:
            context = BuildContext(
                run_id="team-artifacts", workspace_id="workspace-team-artifacts", workspace_root=workspace,
                project_id=31, conversation_id=32,
                request="Design a subscription workspace with account settings and clear status feedback.",
                granted_tool_scopes=("workspace.read", "workspace.write"), dry_run=False,
                metadata={"project_title": "Subscription workspace"},
            )
            product_task = TaskDefinition(
                task_id="team-artifacts:agent_071", agent_id="agent_071", title="Product brief", purpose="Product",
                allowed_tool_scopes=("workspace.read", "workspace.write"), allowed_path_scopes=("agent-artifacts/**",),
            )
            frontend_task = TaskDefinition(
                task_id="team-artifacts:agent_091", agent_id="agent_091", title="Frontend contract", purpose="Frontend",
                allowed_tool_scopes=("workspace.read", "workspace.write"), allowed_path_scopes=("agent-artifacts/**",),
            )
            product_execution, _ = get_agent("agent_071").run(context, product_task)
            frontend_execution, _ = get_agent("agent_091").run(context, frontend_task)
            self.assertEqual(TaskStatus.SUCCEEDED, product_execution.status)
            self.assertEqual(TaskStatus.SUCCEEDED, frontend_execution.status)
            product_artifact = Path(workspace) / product_execution.changed_files[0]
            frontend_artifact = Path(workspace) / frontend_execution.changed_files[0]
            product_content = product_artifact.read_text(encoding="utf-8")
            frontend_content = frontend_artifact.read_text(encoding="utf-8")
            product_manifest_path = Path(workspace) / next(path for path in product_execution.changed_files if path.endswith(".work-product.json"))
            frontend_manifest_path = Path(workspace) / next(path for path in frontend_execution.changed_files if path.endswith(".work-product.json"))
            product_manifest = json.loads(product_manifest_path.read_text(encoding="utf-8"))
            frontend_manifest = json.loads(frontend_manifest_path.read_text(encoding="utf-8"))
            self.assertIn("### Problem framing", product_content)
            self.assertIn("### Component boundary", frontend_content)
            self.assertNotEqual(product_content, frontend_content)
            self.assertIn("`subscription`", product_content)
            self.assertIn("`subscription`", frontend_content)
            self.assertEqual("smartbuild-agent-work-product-v1", product_manifest["format"])
            self.assertEqual("agent_071", product_manifest["canonicalAgentId"])
            self.assertEqual("product", product_manifest["sourceRole"]["team"])
            self.assertEqual("frontend", frontend_manifest["sourceRole"]["team"])
            self.assertEqual(["agent-artifacts/**"], product_manifest["buildScope"]["allowedPathScopes"])
            self.assertEqual("not-performed", product_manifest["externalActions"])
            self.assertEqual(3, len(product_manifest["actions"]))
            self.assertEqual("proposed", product_manifest["actions"][0]["status"])
            self.assertNotEqual(product_manifest["actions"], frontend_manifest["actions"])

    def test_additive_artifacts_are_request_specific_for_portfolio_and_restaurant(self) -> None:
        requests = {
            "portfolio": "Create a portfolio website for Maya Noor, a product designer, with case studies and a contact page.",
            "restaurant": "Create a restaurant website for Bella Tavola with a menu, reservations, and opening hours.",
        }
        artifacts: dict[str, str] = {}
        with tempfile.TemporaryDirectory() as workspace:
            for label, request in requests.items():
                context = BuildContext(
                    run_id=f"request-{label}", workspace_id=f"workspace-{label}", workspace_root=workspace,
                    project_id=51, conversation_id=52, request=request,
                    granted_tool_scopes=("workspace.read", "workspace.write"), dry_run=False,
                    metadata={"project_title": label.title()},
                )
                task = TaskDefinition(
                    task_id=f"request-{label}:agent_071", agent_id="agent_071", title="Product brief", purpose="Product",
                    allowed_tool_scopes=("workspace.read", "workspace.write"), allowed_path_scopes=("agent-artifacts/**",),
                )
                execution, _ = get_agent("agent_071").run(context, task)
                self.assertEqual(TaskStatus.SUCCEEDED, execution.status)
                self.assertEqual(2, len(execution.changed_files))
                artifact = Path(workspace) / execution.changed_files[0]
                self.assertTrue(artifact.is_file())
                manifest = Path(workspace) / next(path for path in execution.changed_files if path.endswith(".work-product.json"))
                self.assertTrue(manifest.is_file())
                artifacts[label] = artifact.read_text(encoding="utf-8")
            self.assertNotEqual(artifacts["portfolio"], artifacts["restaurant"])
            self.assertIn("`portfolio`", artifacts["portfolio"])
            self.assertIn("`restaurant`", artifacts["restaurant"])

    def test_original_work_products_are_request_scoped_without_copying_request_or_secret(self) -> None:
        requests = {
            "portfolio": "Create a portfolio for Maya Noor. SECRET-LIKE-PORTFOLIO-INPUT",
            "restaurant": "Create a restaurant for Bella Tavola. SECRET-LIKE-RESTAURANT-INPUT",
        }
        reports: dict[str, str] = {}
        manifests: dict[str, dict[str, object]] = {}
        for label, request in requests.items():
            with tempfile.TemporaryDirectory() as workspace:
                context = BuildContext(
                    run_id="original-request-scope", workspace_id="workspace-original-scope", workspace_root=workspace,
                    project_id=71, conversation_id=72, request=request,
                    granted_tool_scopes=("workspace.read", "workspace.write"), dry_run=False,
                    metadata={"project_title": "Request-scoped verification"},
                )
                task = TaskDefinition(
                    task_id="original-request-scope:agent_003", agent_id="agent_003", title="Intent verification",
                    purpose="Planning", allowed_tool_scopes=("workspace.read", "workspace.write"),
                    allowed_path_scopes=("agent-artifacts/**",),
                )
                execution, _ = get_agent("agent_003").run(context, task)
                self.assertEqual(TaskStatus.SUCCEEDED, execution.status)
                report_path = Path(workspace) / next(path for path in execution.changed_files if path.endswith(".md"))
                manifest_path = Path(workspace) / next(path for path in execution.changed_files if path.endswith(".work-product.json"))
                reports[label] = report_path.read_text(encoding="utf-8")
                manifests[label] = json.loads(manifest_path.read_text(encoding="utf-8"))
                self.assertNotIn(request, reports[label])
                self.assertNotIn("SECRET-LIKE", reports[label])
                self.assertNotIn(request, json.dumps(manifests[label], ensure_ascii=False))
                self.assertEqual("original-canonical", manifests[label]["agentKind"])
                self.assertEqual("agent_003", manifests[label]["canonicalAgentId"])
                self.assertEqual("not-performed", manifests[label]["externalActions"])
        self.assertNotEqual(reports["portfolio"], reports["restaurant"])
        self.assertNotEqual(
            manifests["portfolio"]["requestScopeFingerprint"], manifests["restaurant"]["requestScopeFingerprint"]
        )

    def test_additive_agent_blocks_when_task_scope_excludes_its_artifact(self) -> None:
        with tempfile.TemporaryDirectory() as workspace:
            context = BuildContext(
                run_id="scope-denied", workspace_id="workspace-scope-denied", workspace_root=workspace,
                project_id=41, conversation_id=42, request="Define a subscription product strategy.",
                granted_tool_scopes=("workspace.read", "workspace.write"), dry_run=False,
            )
            task = TaskDefinition(
                task_id="scope-denied:agent_071", agent_id="agent_071", title="Product brief", purpose="Product",
                allowed_tool_scopes=("workspace.read", "workspace.write"), allowed_path_scopes=("docs/**",),
            )
            execution, _ = get_agent("agent_071").run(context, task)
            self.assertEqual(TaskStatus.BLOCKED, execution.status)
            self.assertEqual("AGENT_TASK_BLOCKED", execution.blocked_reason)
            self.assertTrue(execution.evidence_refs)
            evidence_path = execution.evidence_refs[0].split("#sha256:", 1)[0]
            evidence_text = (Path(workspace) / evidence_path).read_text(encoding="utf-8")
            self.assertIn("AGENT_TASK_BLOCKED", evidence_text)
            self.assertNotIn("AGENT_OUTPUT_PATH_OUTSIDE_TASK_SCOPE", evidence_text)

    def test_generic_build_verbs_do_not_select_the_entire_catalog(self) -> None:
        from .supervisor import Supervisor

        selected = Supervisor()._selected_ids("build a responsive SaaS landing page")
        self.assertIn("agent_003", selected)
        self.assertIn("agent_005", selected)
        self.assertLessEqual(len(selected), 14)

    def test_minimal_arabic_website_request_asks_for_its_purpose_before_building(self) -> None:
        from .supervisor import Supervisor

        supervisor = Supervisor()
        request = "ابني موقع"
        selected = supervisor._selected_ids(request)
        context = BuildContext(
            run_id="arabic-website-selection",
            workspace_id="workspace-arabic-website-selection",
            workspace_root=".",
            project_id=81,
            conversation_id=82,
            request=request,
            granted_tool_scopes=("workspace.read", "workspace.write"),
            dry_run=True,
        )
        plan = supervisor.plan(context)
        planned_agent_ids = {agent.id for agent in plan.selected_agents}

        self.assertTrue(supervisor._needs_clarification(request))
        self.assertEqual({"agent_001"}, planned_agent_ids)
        self.assertIsNone(plan.blocked_reason)

    def test_specific_arabic_site_request_can_be_built_without_clarification(self) -> None:
        from .supervisor import Supervisor

        supervisor = Supervisor()
        request = "ابني موقع لمطعم"
        context = BuildContext(
            run_id="arabic-restaurant-selection",
            workspace_id="workspace-arabic-restaurant-selection",
            workspace_root=".",
            project_id=81,
            conversation_id=82,
            request=request,
            granted_tool_scopes=("workspace.read", "workspace.write"),
            dry_run=True,
        )

        plan = supervisor.plan(context)

        self.assertFalse(supervisor._needs_clarification(request))
        self.assertIn("agent_003", {agent.id for agent in plan.selected_agents})
        self.assertNotIn("agent_001", {agent.id for agent in plan.selected_agents})

    def test_accented_cafe_request_selects_production_page_writers(self) -> None:
        from .supervisor import Supervisor

        request = (
            "Build a polished website for a neighborhood café called Cedar & Steam. "
            "Design it for exactly three user groups: walk-in guests, takeout customers, "
            "and café staff. Include the menu, opening hours and location, plus a simple "
            "working way to place an order. Make it a real, usable site rather than a static mockup."
        )
        context = BuildContext(
            run_id="accented-cafe-selection",
            workspace_id="workspace-accented-cafe-selection",
            workspace_root=".",
            project_id=81,
            conversation_id=82,
            request=request,
            granted_tool_scopes=("workspace.read", "workspace.write"),
            dry_run=True,
        )

        plan = Supervisor().plan(context)
        planned_agent_ids = {agent.id for agent in plan.selected_agents}

        self.assertFalse(Supervisor._needs_clarification(request))
        self.assertIn("agent_005", planned_agent_ids)
        self.assertNotIn("agent_001", planned_agent_ids)
        self.assertIsNone(plan.blocked_reason)

    def test_arabic_reading_club_request_selects_production_page_writers(self) -> None:
        request = "ابني موقع نادي قراءة أونلاين بسيط لعدد 24 عضو"
        context = BuildContext(
            run_id="arabic-reading-club",
            workspace_id="workspace-arabic-reading-club",
            workspace_root=".",
            project_id=81,
            conversation_id=82,
            request=request,
            granted_tool_scopes=("workspace.read", "workspace.write"),
            dry_run=True,
        )
        plan = Supervisor().plan(context)
        planned_agent_ids = {agent.id for agent in plan.selected_agents}

        self.assertFalse(Supervisor._needs_clarification(request))
        self.assertIn("agent_005", planned_agent_ids)
        self.assertIn("agent_030", planned_agent_ids)
        self.assertNotIn("agent_001", planned_agent_ids)
        self.assertIsNone(plan.blocked_reason)

    def test_arabic_reading_club_edit_selects_production_page_writers_without_clarification(self) -> None:
        request = "في موقع نادي القراءة، غيّر عنوان الكتاب The Quiet Atlas إلى The Glass Orchard، وحافظ على البحث والتقدم وRSVP."
        context = BuildContext(
            run_id="arabic-reading-club-edit",
            workspace_id="workspace-arabic-reading-club-edit",
            workspace_root=".",
            project_id=81,
            conversation_id=82,
            request=request,
            granted_tool_scopes=("workspace.read", "workspace.write"),
            dry_run=True,
        )
        plan = Supervisor().plan(context)
        planned_agent_ids = {agent.id for agent in plan.selected_agents}

        self.assertFalse(Supervisor._needs_clarification(request))
        self.assertIn("agent_005", planned_agent_ids)
        self.assertNotIn("agent_001", planned_agent_ids)

    def test_arabic_apparel_store_selects_frontend_writer_and_design_review_agents(self) -> None:
        from .supervisor import Supervisor

        request = "ابني متجر إلكتروني للملابس والإكسسوارات، يكون مناسب للموبايل وفيه تصفح للمنتجات وإضافة للسلة"
        context = BuildContext(
            run_id="arabic-apparel-store",
            workspace_id="workspace-arabic-apparel-store",
            workspace_root=".",
            project_id=81,
            conversation_id=82,
            request=request,
            granted_tool_scopes=("workspace.read", "workspace.write"),
            dry_run=True,
        )
        plan = Supervisor().plan(context)
        planned_agent_ids = {agent.id for agent in plan.selected_agents}

        self.assertTrue({"agent_003", "agent_005", "agent_009", "agent_029", "agent_030", "agent_033"}.issubset(planned_agent_ids))
        self.assertNotIn("agent_001", planned_agent_ids)
        self.assertIsNone(plan.blocked_reason)

    def test_refining_an_existing_design_does_not_ask_for_a_new_site_purpose(self) -> None:
        self.assertFalse(Supervisor._needs_clarification("Change the colors and make the heading larger."))

    def test_negated_external_services_do_not_select_backend_agents_for_a_portfolio(self) -> None:
        from .supervisor import Supervisor

        selected = Supervisor()._selected_ids(
            "Build a responsive photographer portfolio with a gallery, contact form, and validation. "
            "Use local data only; no external services or real integrations."
        )

        self.assertTrue({"agent_003", "agent_005", "agent_007", "agent_029", "agent_030", "agent_033"}.issubset(selected))
        self.assertTrue({"agent_006", "agent_021", "agent_022", "agent_023"}.isdisjoint(selected))

    def test_preview_does_not_trigger_live_feedback_gate(self) -> None:
        from .supervisor import Supervisor

        selected = Supervisor()._selected_ids("Build a login page and start the preview.")
        self.assertNotIn("agent_004", selected)
        self.assertIn("agent_005", selected)

    def test_supervisor_plan_emits_only_safe_selection_reason_codes(self) -> None:
        from .supervisor import Supervisor

        request = "Build a portfolio workspace. SECRET-LIKE-SELECTION-INPUT"
        context = BuildContext(
            run_id="safe-selection-codes", workspace_id="workspace-safe-selection", workspace_root=".",
            project_id=81, conversation_id=82, request=request,
            granted_tool_scopes=("workspace.read", "workspace.write"), dry_run=True,
        )
        plan = Supervisor().plan(context)
        allowed_selected = {
            "REQUEST_CAPABILITY_MATCH",
            "SCOPED_WORKFLOW_DEPENDENCY",
            "VERIFICATION_GATE_REQUIRED",
            "CHECKPOINT_AFTER_VERIFICATION",
        }
        self.assertTrue(plan.tasks)
        self.assertTrue(all(task.selected_reason in allowed_selected for task in plan.tasks))
        self.assertTrue(all(reason == "TRIGGER_NOT_MATCHED_OR_NOT_REQUIRED" for _, reason in plan.skipped_agents))
        plan_text = json.dumps(
            {
                "tasks": [{"agentId": task.agent_id, "selectedReason": task.selected_reason} for task in plan.tasks],
                "skipped": plan.skipped_agents,
            },
            ensure_ascii=False,
        )
        self.assertNotIn(request, plan_text)
        self.assertNotIn("SECRET-LIKE", plan_text)


    def test_functional_html_escapes_and_normalizes_request_title(self) -> None:
        with tempfile.TemporaryDirectory() as workspace:
            context = BuildContext(
                run_id="html-title-safe", workspace_id="workspace-html-title-safe", workspace_root=workspace,
                project_id=91, conversation_id=92, request="Create a safe page.",
                granted_tool_scopes=("workspace.read", "workspace.write"), dry_run=False,
                metadata={"project_title": "  Demo\x00\tWorkspace  "},
            )
            agent = get_agent("agent_005")
            task = TaskDefinition(
                task_id="html-title-safe:agent_005", agent_id="agent_005", title="Functional interface",
                purpose="Frontend", allowed_tool_scopes=agent.spec.allowed_tool_scopes,
                allowed_path_scopes=agent.spec.allowed_path_scopes,
            )
            execution, _ = agent.run(context, task)
            self.assertEqual(TaskStatus.SUCCEEDED, execution.status)
            index_path = Path(workspace) / next(path for path in execution.changed_files if path.endswith("index.html"))
            html = index_path.read_text(encoding="utf-8")
            self.assertIn("<title>Demo Workspace</title>", html)
            self.assertIn('<h1 id="project-identity" data-smartbuild-project-identity="visible"', html)
            self.assertIn(">Demo Workspace</h1>", html)
            self.assertNotIn("\\x00", html)
            self.assertNotIn("<script>", html)


if __name__ == "__main__":
    unittest.main()
