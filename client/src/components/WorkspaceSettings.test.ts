import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { domainPurchaseSearchUrl, WorkspaceSettings } from "./WorkspaceSettings";

describe("workspace General settings", () => {
  it("creates registrar search links only for a provided domain query", () => {
    expect(domainPurchaseSearchUrl("namecheap", "")).toBeNull();
    expect(domainPurchaseSearchUrl("namecheap", "my site.com")).toBe("https://www.namecheap.com/domains/registration/results/?domain=my%20site.com");
    expect(domainPurchaseSearchUrl("godaddy", "example.com")).toBe("https://www.godaddy.com/domainsearch/find?domainToCheck=example.com");
  });

  it("shows the generated website name and actual Preview without project IDs or build internals", () => {
    const markup = renderToStaticMarkup(createElement(WorkspaceSettings, {
      projectId: 42,
      publishRevision: null,
      run: {
        id: "build-run-123",
        contract: { projectName: "Accessly" },
        preview: { proxyUrl: "http://127.0.0.1:4500", projectVersion: 7, status: "ready" },
      },
    }));

    expect(markup).toContain("Accessly");
    expect(markup).toContain("Open current preview");
    expect(markup).toContain("http://127.0.0.1:4500");
    expect(markup).not.toContain("Project 42");
    expect(markup).not.toContain("Build status");
    expect(markup).not.toContain("Project version");
    expect(markup).not.toContain("Build Run");
    expect(markup).not.toContain("Notifications");
  });

  it("does not substitute a workspace label or numeric project ID for a missing website name", () => {
    const markup = renderToStaticMarkup(createElement(WorkspaceSettings, {
      projectId: 42,
      publishRevision: null,
      run: null,
    }));

    expect(markup).toContain("No website build selected");
    expect(markup).not.toContain("Project 42");
  });
});
