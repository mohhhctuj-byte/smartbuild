import { afterEach, describe, expect, it, vi } from "vitest";

const fsMocks = vi.hoisted(() => ({ readdir: vi.fn(), stat: vi.fn(), readFile: vi.fn(), writeFile: vi.fn(), mkdir: vi.fn(), rm: vi.fn(), unlink: vi.fn() }));
vi.mock("node:fs", () => ({ promises: fsMocks }));

import { cloudWorkspaceStatus, exportCloudWorkspaceZip, listCloudWorkspaceFiles, readCloudWorkspaceFile, resolveCloudWorkspacePath, toCloudWorkspaceError, uploadCloudWorkspaceFile, writeCloudWorkspaceFile } from "./cloudWorkspace";

afterEach(() => vi.clearAllMocks());

describe("Cloud workspace boundary", () => {
  it("advertises a browser-first Cloud workspace without a Desktop requirement", () => {
    expect(cloudWorkspaceStatus()).toMatchObject({ kind: "cloud", label: "Cloud workspace", desktopBridge: false, supportsUpload: true, supportsDownloadZip: true });
  });

  it("rejects traversal, absolute, hidden, and private paths", () => {
    expect(() => resolveCloudWorkspacePath("../../etc/passwd")).toThrow("PATH_OUTSIDE_WORKSPACE");
    expect(() => resolveCloudWorkspacePath("/etc/passwd")).toThrow("PATH_OUTSIDE_WORKSPACE");
    expect(() => resolveCloudWorkspacePath(".env")).toThrow("WORKSPACE_PATH_UNAVAILABLE");
    expect(() => resolveCloudWorkspacePath("node_modules/package.json")).toThrow("WORKSPACE_PATH_UNAVAILABLE");
  });

  it("lists project output without exposing an absolute root or internal application directories", async () => {
    fsMocks.readdir.mockResolvedValueOnce([{ name: "generated", isDirectory: () => true, isFile: () => false }, { name: "agent_runtime", isDirectory: () => true, isFile: () => false }, { name: "client", isDirectory: () => true, isFile: () => false }, { name: ".env", isDirectory: () => false, isFile: () => true }]).mockResolvedValue([]);
    fsMocks.stat.mockResolvedValue({ size: 4, mtime: new Date("2026-08-17T00:00:00.000Z") });
    expect(await listCloudWorkspaceFiles()).toEqual([{ path: "generated", type: "directory" }]);
  });

  it("maps protected errors to browser-safe copy", () => {
    expect(toCloudWorkspaceError(new Error("PATH_OUTSIDE_WORKSPACE"))).toEqual({ code: "PATH_OUTSIDE_WORKSPACE", message: "That path is outside the Cloud workspace." });
  });

  it("reads, writes, and uploads project-relative files without returning a server root", async () => {
    const stat = { size: 4, mtime: new Date("2026-08-17T00:00:00.000Z"), isFile: () => true, isDirectory: () => false };
    fsMocks.stat.mockResolvedValue(stat);
    fsMocks.readFile.mockResolvedValue("test");
    await expect(readCloudWorkspaceFile("client/src/app.ts")).resolves.toMatchObject({ path: "client/src/app.ts", content: "test" });
    await expect(writeCloudWorkspaceFile("client/src/new.ts", "export const value = 1;")).resolves.toMatchObject({ path: "client/src/new.ts" });
    await expect(uploadCloudWorkspaceFile("uploads/blocked.txt", Buffer.from("x"))).rejects.toThrow("WORKSPACE_PATH_UNAVAILABLE");
    await expect(uploadCloudWorkspaceFile("import/example.txt", Buffer.from("x"))).resolves.toMatchObject({ path: "import/example.txt" });
    expect(fsMocks.writeFile).toHaveBeenCalled();
  });

  it("creates a valid ZIP container from allowed workspace files only", async () => {
    fsMocks.readdir.mockResolvedValueOnce([{ name: "README.md", isDirectory: () => false, isFile: () => true }]).mockResolvedValue([]);
    fsMocks.stat.mockResolvedValue({ size: 4, mtime: new Date("2026-08-17T00:00:00.000Z"), isFile: () => true, isDirectory: () => false });
    fsMocks.readFile.mockResolvedValue(Buffer.from("test"));
    const zip = await exportCloudWorkspaceZip();
    expect(zip.subarray(0, 4).toString("hex")).toBe("504b0304");
    expect(zip.includes(Buffer.from("smartbuild-workspace/README.md"))).toBe(true);
  });
});
