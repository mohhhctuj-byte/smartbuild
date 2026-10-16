import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

describe("project API key persistence", () => {
  it("isolates keys by owner and project, supports rotation and deletion, and removes keys with a project", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "smartbuild-project-secrets-"));
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("AUTH_STATE_FILE", path.join(directory, "state.json"));
    vi.resetModules();

    try {
      const db = await import("./db");
      const project = await db.createProject(101, "Secret owner project");
      const foreignProject = await db.createProject(202, "Other owner project");
      const initial = { name: "GEMINI_API_KEY", provider: "Gemini", ciphertext: "encrypted-one", iv: "iv-one", authTag: "tag-one" };
      const saved = await db.createProjectSecret(101, project.id, initial);
      const persistedWithSecret = fs.readFileSync(path.join(directory, "state.json"), "utf8");
      expect(persistedWithSecret).toContain("encrypted-one");
      expect(persistedWithSecret).not.toContain("raw-api-key");

      expect((await db.listProjectSecrets(101, project.id)).map(secret => secret.name)).toEqual(["GEMINI_API_KEY"]);
      expect(await db.listProjectSecrets(202, project.id)).toEqual([]);
      expect(await db.listProjectSecrets(101, foreignProject.id)).toEqual([]);
      await expect(db.createProjectSecret(101, project.id, initial)).rejects.toThrow("PROJECT_SECRET_NAME_EXISTS");

      await db.updateProjectSecret(101, project.id, saved!.id, { ...initial, ciphertext: "encrypted-two" });
      expect((await db.listProjectSecrets(101, project.id))[0]?.ciphertext).toBe("encrypted-two");
      expect(await db.deleteProjectSecret(202, project.id, saved!.id)).toBe(false);
      expect(await db.deleteProjectSecret(101, project.id, saved!.id)).toBe(true);
      expect(await db.listProjectSecrets(101, project.id)).toEqual([]);

      await db.createProjectSecret(101, project.id, initial);
      await db.deleteProjectForUser(101, project.id);
      expect(await db.listProjectSecrets(101, project.id)).toEqual([]);
      const persistedAfterProjectDeletion = fs.readFileSync(path.join(directory, "state.json"), "utf8");
      expect(persistedAfterProjectDeletion).toContain('"projectSecrets":[]');
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
