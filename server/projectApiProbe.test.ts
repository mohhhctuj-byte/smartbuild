import { describe, expect, it } from "vitest";
import { projectApiProbePath } from "./projectApiProbe";

describe("projectApiProbePath", () => {
  it("checks contact routes for contact-form projects", () => {
    expect(projectApiProbePath({ contract: { template: "contact-form" } })).toBe("/api/contact");
  });

  it("checks a declared data-model route for projects with a database", () => {
    expect(projectApiProbePath({
      contract: { template: "auth-flow", productSpec: { dataModels: [{ name: "CredentialAttempt" }] } },
    })).toBe("/api/data/CredentialAttempt");
  });

  it("rejects a backend project with no declared probeable data model", () => {
    expect(() => projectApiProbePath({ contract: { template: "auth-flow", productSpec: { dataModels: [] } } }))
      .toThrow("PROJECT_DATA_MODEL_REQUIRED");
  });
});
