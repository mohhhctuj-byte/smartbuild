export type DashboardEntityModel = {
  name: string;
  fields: string[];
};

type DashboardDataManifest = {
  version?: unknown;
  entities?: Array<{ name?: unknown; fields?: unknown }>;
};

export function verifyProjectDashboard(input: {
  html: string;
  javascript: string;
  dataModelManifest: string;
  entities: DashboardEntityModel[];
  databaseReady: boolean;
}) {
  const errors: string[] = [];
  if (!input.html.includes('data-project-dashboard="true"')) errors.push("Dashboard root marker is missing.");
  if (!input.html.includes('data-dashboard-source="project-api"')) errors.push("Dashboard is not marked as API-backed.");
  if (!input.html.includes("data-dashboard-metric")) errors.push("Dashboard has no API-derived metric placeholders.");
  if (!input.html.includes('data-dashboard-empty-state') || !input.html.includes("No data available yet.")) {
    errors.push("The explicit empty state is missing.");
  }
  for (const entity of input.entities) {
    if (!input.html.includes(`data-dashboard-entity="${entity.name}"`)) {
      errors.push(`Dashboard section is missing for ${entity.name}.`);
    }
  }
  if (!/fetch\s*\(\s*["'`][^"'`]*\/api\/data\//.test(input.javascript)) {
    errors.push("Dashboard reads are not connected to the project data API.");
  }
  if (!/\brecords\b/.test(input.javascript) || !/(?:\.length\b|\.reduce\s*\()/.test(input.javascript)) {
    errors.push("Dashboard metrics are not aggregated from returned records.");
  }
  if (!input.javascript.includes("data-dashboard-empty-state") || !/catch\s*\(/.test(input.javascript)) {
    errors.push("Dashboard does not handle empty and API error states in its rendering logic.");
  }
  for (const method of ["POST", "PATCH", "DELETE"]) {
    if (!new RegExp(`method\\s*:\\s*["']${method}["']`, "i").test(input.javascript)) {
      errors.push(`Dashboard does not persist ${method} actions through its API.`);
    }
  }
  let manifest: DashboardDataManifest | null = null;
  try {
    manifest = JSON.parse(input.dataModelManifest) as DashboardDataManifest;
  } catch {
    errors.push("The project data-model manifest is not valid JSON.");
  }
  const models: NonNullable<DashboardDataManifest["entities"]> = Array.isArray(manifest?.entities) ? manifest.entities : [];
  if (manifest?.version !== 1 || models.length === 0 || models.length < input.entities.length) {
    errors.push("The project data-model manifest does not match the product specification.");
  }
  for (const entity of input.entities) {
    const model = models.find(candidate => candidate.name === entity.name);
    const fields = model?.fields;
    if (!Array.isArray(fields) || entity.fields.some(field => !fields.includes(field))) {
      errors.push(`The database model is incomplete for ${entity.name}.`);
    }
  }
  for (const model of models) {
    if (typeof model.name === "string" && !input.html.includes(`data-dashboard-entity="${model.name}"`)) {
      errors.push(`Dashboard section is missing for ${model.name}.`);
    }
  }
  if (!input.databaseReady) errors.push("The project SQLite database did not pass its runtime health check.");
  return { passed: errors.length === 0, errors };
}
