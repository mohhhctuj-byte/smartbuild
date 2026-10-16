import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const projectRoot = process.cwd();
const sourcePath = "/home/ubuntu/upload/pasted_content_2.txt";
const raw = readFileSync(sourcePath, "utf8");
const roles = [];

for (const line of raw.split(/\r?\n/)) {
  const cells = line.trim().split("|").map((cell) => cell.trim());
  const sourceId = cells[1] || "";
  if (!/^[A-Z][A-Z0-9]{1,8}-\d{3}$/.test(sourceId)) continue;
  const name = (cells[2] || "").replaceAll("`", "").trim();
  const work = (cells[3] || "").replaceAll("`", "").trim();
  const tools = (cells[4] || "").replaceAll("`", "").trim();
  const [mission = work, output = "structured report"] = work.split("→").map((value) => value.trim());
  if (!name || !mission) throw new Error(`INVALID_SOURCE_ROLE:${sourceId}`);
  roles.push({ sourceId, name, mission, output, tools });
}

if (roles.length < 240) throw new Error(`EXPECTED_240_SOURCE_ROLES:${roles.length}`);
const additive = roles.slice(0, 230);
const deferred = roles.slice(230, 240);
if (new Set(additive.map((role) => role.sourceId)).size !== 230) throw new Error("DUPLICATE_SOURCE_ROLE");

const teamFor = (sourceId) => ({
  PR: "product", UX: "ux", FE: "frontend", BE: "backend", DB: "data", AI: "ai",
  QA: "quality", SEC: "security", OPS: "operations", DX: "developer-experience", DEV: "developer-experience",
  INT: "integrations", GROW: "growth", DOC: "documentation", COMM: "communication", DIAG: "diagnosis", VOICE: "voice",
}[sourceId.split("-")[0]] || "specialist");

const riskFor = (team) => (["security", "operations", "integrations", "data"].includes(team) ? "high" : ["quality", "backend", "ai", "diagnosis"].includes(team) ? "medium" : "low");
const keywordsFor = (team) => ({
  product: ["build", "create", "make", "implement", "product", "app", "website"],
  ux: ["ui", "ux", "page", "website", "mobile", "flow", "landing"],
  frontend: ["frontend", "react", "page", "website", "ui", "form", "landing"],
  backend: ["backend", "api", "database", "persistence", "auth", "endpoint"],
  data: ["database", "schema", "migration", "data", "csv", "search"],
  ai: ["ai", "llm", "agent", "prompt", "chatbot", "assistant"],
  quality: ["test", "quality", "validation", "bug", "review", "e2e"],
  security: ["security", "auth", "permission", "privacy", "payment"],
  operations: ["deploy", "cloud", "ci", "docker", "monitor", "infrastructure"],
  "developer-experience": ["code", "repository", "developer", "workflow", "documentation"],
  integrations: ["integration", "email", "payment", "webhook", "external api"],
  growth: ["seo", "growth", "marketing", "content", "analytics"],
  documentation: ["docs", "documentation", "readme", "spec", "guide"],
  communication: ["chat", "conversation", "support", "message", "assistant"],
  diagnosis: ["debug", "error", "diagnose", "failure", "issue"],
  voice: ["voice", "speech", "audio", "transcribe", "tts"],
  specialist: ["build", "create", "implement"],
}[team]);

const pyString = (value) => JSON.stringify(value);
const pyTuple = (values) => values.length === 1 ? `(${pyString(values[0])},)` : `(${values.map(pyString).join(", ")})`;
const agentDir = join(projectRoot, "server/agents/implementations/additive");
rmSync(agentDir, { recursive: true, force: true });
mkdirSync(agentDir, { recursive: true });
writeFileSync(join(agentDir, "__init__.py"), "# Deterministic additive canonical agent modules.\n", "utf8");

const rows = additive.map((role, offset) => {
  const numericId = offset + 71;
  const team = teamFor(role.sourceId);
  const slug = role.sourceId.toLowerCase().replaceAll("-", "_");
  const moduleName = `agent_${String(numericId).padStart(3, "0")}_${slug}`;
  const className = `Agent${String(numericId).padStart(3, "0")}${role.sourceId.replaceAll("-", "")}`;
  const row = {
    id: `agent_${String(numericId).padStart(3, "0")}`,
    sourceId: role.sourceId,
    name: role.name,
    legacyModuleId: slug,
    modulePath: `server.agents.implementations.additive.${moduleName}`,
    team,
    role: role.mission,
    output: role.output,
    tools: role.tools,
    triggers: keywordsFor(team),
    risk: riskFor(team),
  };
  const module = `from __future__ import annotations\n\nfrom ..catalog_agent import CatalogResponsibilityAgent\n\n\nclass ${className}(CatalogResponsibilityAgent):\n    source_id = ${pyString(row.sourceId)}\n    source_name = ${pyString(row.name)}\n    source_mission = ${pyString(row.role)}\n    source_output = ${pyString(row.output)}\n    source_tools = ${pyString(row.tools)}\n    source_team = ${pyString(row.team)}\n\n`;
  writeFileSync(join(agentDir, `${moduleName}.py`), module, "utf8");
  return { ...row, className, moduleName };
});

const catalogFile = join(projectRoot, "server/agents/additive_catalog.py");
const catalogLines = [
  '"""Static additive source catalogue generated from the user-supplied role specification."""',
  "from __future__ import annotations",
  "",
  "ADDITIVE_CATALOG: tuple[dict[str, object], ...] = (",
  ...rows.map((row) => `    {"id": ${pyString(row.id)}, "source_id": ${pyString(row.sourceId)}, "name": ${pyString(row.name)}, "legacy_module_id": ${pyString(row.legacyModuleId)}, "module_path": ${pyString(row.modulePath)}, "team": ${pyString(row.team)}, "role": ${pyString(row.role)}, "output": ${pyString(row.output)}, "source_tools": ${pyString(row.tools)}, "triggers": ${pyTuple(row.triggers)}, "risk": ${pyString(row.risk)}},`),
  ")",
  "",
  "DEFERRED_SOURCE_ROLES: tuple[dict[str, str], ...] = (",
  ...deferred.map((role) => `    {"source_id": ${pyString(role.sourceId)}, "name": ${pyString(role.name)}, "reason": "DEFERRED_OUTSIDE_CONFIRMED_230_ADDITIONS"},`),
  ")",
  "",
  "CANONICAL_AGENT_COUNT = 300",
  "ADDITIVE_AGENT_COUNT = 230",
  "",
];
writeFileSync(catalogFile, catalogLines.join("\n"), "utf8");

const bindingsFile = join(projectRoot, "server/agents/additive_implementation_bindings.py");
const bindingLines = [
  '"""Explicit additive module bindings generated from the frozen source catalogue."""',
  "from __future__ import annotations",
  "",
  ...rows.map((row) => `from .implementations.additive.${row.moduleName} import ${row.className}`),
  "",
  "ADDITIVE_IMPLEMENTATION_CLASSES = {",
  ...rows.map((row) => `    ${pyString(row.id)}: ${row.className},`),
  "}",
  "",
];
writeFileSync(bindingsFile, bindingLines.join("\n"), "utf8");

console.log(JSON.stringify({ generated: rows.length, deferred: deferred.map((role) => role.sourceId) }));
