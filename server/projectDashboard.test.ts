import { describe, expect, it } from "vitest";
import { verifyProjectDashboard } from "./projectDashboard";

const required = {
  html: '<nav>Orders</nav><main data-project-dashboard="true" data-dashboard-source="project-api"><section data-dashboard-entity="Order"><span data-dashboard-metric="orders"></span></section><p data-dashboard-empty-state>No data available yet.</p></main>',
  javascript: `try{const response=await fetch("/api/data/Order");const records=(await response.json()).records;const total=records.length;document.querySelector("[data-dashboard-empty-state]").hidden=records.length>0;}catch(error){showError(error)}fetch("/api/data/Order",{method:"POST"});fetch("/api/data/Order/id",{method:"PATCH"});fetch("/api/data/Order/id",{method:"DELETE"});`,
  dataModelManifest: JSON.stringify({ version: 1, entities: [{ name: "Order", fields: ["total", "status"], requiredFields: ["status"] }] }),
  entities: [{ name: "Order", fields: ["total", "status"] }],
  databaseReady: true,
};

describe("project dashboard verification", () => {
  it("accepts project-model-driven dashboard backed by a live SQLite API", () => {
    expect(verifyProjectDashboard(required)).toEqual({ passed: true, errors: [] });
  });

  it("accepts entities derived from a quiz request instead of fixed analytics blueprint entities", () => {
    const html = '<main data-project-dashboard="true" data-dashboard-source="project-api"><section data-dashboard-entity="Quiz"></section><section data-dashboard-entity="Student"></section><span data-dashboard-metric="attempts"></span><p data-dashboard-empty-state>No data available yet.</p></main>';
    const javascript = required.javascript.replaceAll("Order", "Student");
    const dataModelManifest = JSON.stringify({
      version: 1,
      entities: [
        { name: "Quiz", fields: ["title", "questionCount"], requiredFields: ["title"] },
        { name: "Student", fields: ["name", "email"], requiredFields: ["name"] },
      ],
    });
    expect(verifyProjectDashboard({
      html,
      javascript,
      dataModelManifest,
      entities: [],
      databaseReady: true,
    })).toEqual({ passed: true, errors: [] });
  });

  it("rejects missing real records API, CRUD writes, model fields, and honest empty state", () => {
    const result = verifyProjectDashboard({
      ...required,
      html: '<main data-project-dashboard="true"><section data-dashboard-entity="Product"></section></main>',
      javascript: "const orders = [{total: 100}]; localStorage.setItem('orders', JSON.stringify(orders));",
      dataModelManifest: JSON.stringify({ version: 1, entities: [{ name: "Order", fields: ["status"] }] }),
      databaseReady: false,
    });
    expect(result.passed).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      "The explicit empty state is missing.",
      "Dashboard section is missing for Order.",
      "Dashboard reads are not connected to the project data API.",
      "Dashboard does not persist POST actions through its API.",
      "The database model is incomplete for Order.",
      "The project SQLite database did not pass its runtime health check.",
    ]));
  });
});
