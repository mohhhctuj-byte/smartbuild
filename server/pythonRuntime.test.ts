import { afterEach, describe, expect, it } from "vitest";
import { PythonRuntimeResolutionError, resolvePythonRuntime } from "./pythonRuntime";

const previousConfiguredPython = process.env.SMARTBUILD_PYTHON_EXECUTABLE;
const previousLegacyPython = process.env.VEYRA_PYTHON_BIN;

afterEach(() => {
  if (previousConfiguredPython === undefined) delete process.env.SMARTBUILD_PYTHON_EXECUTABLE;
  else process.env.SMARTBUILD_PYTHON_EXECUTABLE = previousConfiguredPython;
  if (previousLegacyPython === undefined) delete process.env.VEYRA_PYTHON_BIN;
  else process.env.VEYRA_PYTHON_BIN = previousLegacyPython;
});

describe("Python runtime resolver", () => {
  it("resolves the configured Python runtime and records its version diagnostic", async () => {
    process.env.SMARTBUILD_PYTHON_EXECUTABLE = "python3";
    const runtime = await resolvePythonRuntime({ component: "runtime-unit-test" });
    expect(runtime.executable).toBeTruthy();
    expect(runtime.diagnostic.status).toBe("ready");
    expect(runtime.diagnostic.resolvedExecutable).toBeTruthy();
    expect(runtime.diagnostic.workingDirectory).toBe("service");
    expect(runtime.diagnostic.pythonVersion).toMatch(/^\d+\.\d+/);
    expect(runtime.diagnostic.pydanticVersion).toMatch(/^\d+\.\d+/);
    expect(runtime.diagnostic.attempts.at(-1)).toMatchObject({ result: "ready" });
  });

  it("falls back from an invalid configured runtime to another validated configured candidate", async () => {
    process.env.SMARTBUILD_PYTHON_EXECUTABLE = "/definitely-not-a-smartbuild-python";
    process.env.VEYRA_PYTHON_BIN = "python3";
    const runtime = await resolvePythonRuntime({ component: "runtime-unit-test" });
    expect(runtime.diagnostic.status).toBe("ready");
    expect(runtime.diagnostic.attempts[0]).toEqual({ candidate: "configured-runtime", result: "not_executable" });
    expect(runtime.diagnostic.attempts.at(-1)).toMatchObject({ result: "ready" });
  });

  it("returns a bounded unavailable diagnostic only after every safe candidate fails", async () => {
    process.env.SMARTBUILD_PYTHON_EXECUTABLE = "/definitely-not-a-smartbuild-python";
    process.env.VEYRA_PYTHON_BIN = "/also-not-a-smartbuild-python";
    await expect(resolvePythonRuntime({ component: "runtime-unit-test", requiredModules: ["module_that_does_not_exist"] })).rejects.toMatchObject({
      name: "PythonRuntimeResolutionError",
      message: "PYTHON_RUNTIME_UNAVAILABLE",
      diagnostic: { status: "unavailable", resolvedExecutable: null },
    } satisfies Partial<PythonRuntimeResolutionError>);
  });
});
