import { execFile } from "node:child_process";
import { access, constants, readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const DEFAULT_PYTHON_REQUIREMENTS = [
  "pydantic",
  "fastapi",
  "starlette",
  "uvicorn",
  "httpx",
  "sqlalchemy",
  "sqlmodel",
  "alembic",
  "redis",
  "celery",
  "rq",
  "apscheduler",
  "numpy",
  "pandas",
  "polars",
  "scikit-learn",
  "matplotlib",
  "plotly",
  "jupyter",
];

async function discoverWindowsPythonCandidates(): Promise<string[]> {
  const searchRoots = [
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Programs", "Python") : undefined,
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, "Python") : undefined,
    process.env["ProgramFiles(x86)"] ? path.join(process.env["ProgramFiles(x86)"], "Python") : undefined,
  ].filter((value): value is string => Boolean(value));

  const discovered: string[] = [];
  for (const root of searchRoots) {
    try {
      const entries = await readdir(root, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        for (const candidate of [
          path.join(root, entry.name, "python.exe"),
          path.join(root, entry.name, "python3.exe"),
          path.join(root, entry.name, "python"),
          path.join(root, entry.name, "python3"),
        ]) {
          discovered.push(candidate);
        }
      }
    } catch {
      // Ignore missing installation folders; the standard runtime candidates below are still checked.
    }
  }
  return discovered;
}

export type PythonRuntimeDiagnostic = {
  component: string;
  status: "ready" | "unavailable";
  resolvedExecutable: string | null;
  pythonVersion: string | null;
  pydanticVersion: string | null;
  requiredModules: string[];
  workingDirectory: string;
  attempts: Array<{ candidate: string; result: "ready" | "not_executable" | "probe_failed" }>;
};

export class PythonRuntimeResolutionError extends Error {
  constructor(public readonly diagnostic: PythonRuntimeDiagnostic) {
    super("PYTHON_RUNTIME_UNAVAILABLE");
    this.name = "PythonRuntimeResolutionError";
  }
}

export function pythonRuntimeEnvironment(extra: NodeJS.ProcessEnv = {}) {
  return {
    ...process.env,
    PYTHONDONTWRITEBYTECODE: "1",
    PYTHONUTF8: "1",
    PYTHONIOENCODING: "utf-8",
    ...extra,
  };
}

async function candidates(): Promise<string[]> {
  const configured = [process.env.SMARTBUILD_PYTHON_EXECUTABLE, process.env.VEYRA_PYTHON_BIN]
    .filter((value): value is string => Boolean(value?.trim()))
    .map(value => value.trim());
  const systemCandidates = [
    "/opt/smartbuild-python/bin/python",
    "/usr/local/bin/python3",
    "/usr/bin/python3",
    "python3",
    "python",
  ];
  const windowsCandidates = process.platform === "win32" ? await discoverWindowsPythonCandidates() : [];
  // A configured candidate is preferred, but cannot be a single point of
  // failure. Deployment platforms may inject a stale executable path while
  // the image still has the verified SmartBuild interpreter available.
  return Array.from(new Set([...configured, ...windowsCandidates, ...systemCandidates]));
}

function safeCandidateLabel(candidate: string) {
  const explicitlyConfigured = [process.env.SMARTBUILD_PYTHON_EXECUTABLE, process.env.VEYRA_PYTHON_BIN]
    .some(value => value?.trim() === candidate);
  if (explicitlyConfigured) return "configured-runtime";
  return path.isAbsolute(candidate) ? "system-python" : candidate;
}

async function isRunnableAbsolute(candidate: string) {
  if (!path.isAbsolute(candidate)) return true;
  try {
    await access(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function resolvePythonRuntime(input: { component: string; workingDirectory?: string; requiredModules?: string[] }): Promise<{ executable: string; diagnostic: PythonRuntimeDiagnostic }> {
  const workingDirectory = path.resolve(input.workingDirectory || process.cwd());
  const safeWorkingDirectory = input.workingDirectory ? "workspace" : "service";
  const requiredModules = Array.from(new Set((input.requiredModules?.length ? input.requiredModules : ["pydantic"]).filter(module => /^[A-Za-z_][A-Za-z0-9_.]*$/.test(module))));
  const attempts: PythonRuntimeDiagnostic["attempts"] = [];
  for (const candidate of await candidates()) {
    const safeCandidate = safeCandidateLabel(candidate);
    if (!(await isRunnableAbsolute(candidate))) {
      attempts.push({ candidate: safeCandidate, result: "not_executable" });
      continue;
    }
    try {
      const needsPydantic = requiredModules.includes("pydantic");
      const probe = `import importlib, sys; modules=${JSON.stringify(requiredModules)}; [importlib.import_module(module) for module in modules]; print(sys.executable); print(sys.version.split()[0]); print(importlib.import_module("pydantic").__version__ if ${needsPydantic ? "True" : "False"} else "")`;
      const { stdout, stderr } = await execFileAsync(candidate, ["-c", probe], {
        cwd: workingDirectory,
        timeout: 5_000,
        maxBuffer: 16 * 1024,
        env: pythonRuntimeEnvironment(),
      });
      const lines = `${stdout}\n${stderr}`.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
      const executable = lines[0] || candidate;
      const diagnostic: PythonRuntimeDiagnostic = {
        component: input.component,
        status: "ready",
        resolvedExecutable: safeCandidate,
        pythonVersion: lines[1] || null,
        pydanticVersion: needsPydantic ? lines[2] || null : null,
        requiredModules,
        workingDirectory: safeWorkingDirectory,
        attempts: [...attempts, { candidate: safeCandidate, result: "ready" }],
      };
      return { executable, diagnostic };
    } catch {
      attempts.push({ candidate: safeCandidate, result: "probe_failed" });
    }
  }
  throw new PythonRuntimeResolutionError({
    component: input.component,
    status: "unavailable",
    resolvedExecutable: null,
    pythonVersion: null,
    pydanticVersion: null,
    requiredModules,
    workingDirectory: safeWorkingDirectory,
    attempts,
  });
}
