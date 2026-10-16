import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DatabaseExplorer, formatDatabaseCell } from "./DatabaseExplorer";

describe("project database explorer", () => {
  it("formats stored values and leaves empty cells explicit", () => {
    expect(formatDatabaseCell("guest@example.test")).toBe("guest@example.test");
    expect(formatDatabaseCell(42)).toBe("42");
    expect(formatDatabaseCell(null)).toBe("—");
    expect(formatDatabaseCell({ active: true })).toBe('{"active":true}');
  });

  it("shows an empty project state instead of sample tables or rows", () => {
    const markup = renderToStaticMarkup(createElement(DatabaseExplorer, { run: null }));
    expect(markup).toContain("Database");
    expect(markup).toContain("Build a project to inspect its database.");
    expect(markup).toContain("Create or select a project build to see its database.");
    expect(markup).not.toContain("users");
    expect(markup).not.toContain("109");
  });
});
