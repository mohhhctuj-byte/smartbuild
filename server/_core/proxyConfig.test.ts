import { describe, expect, it, vi } from "vitest";
import { configureTrustedProxy } from "./proxyConfig";

describe("configureTrustedProxy", () => {
  it("trusts exactly the managed TLS proxy hop", () => {
    const set = vi.fn();

    configureTrustedProxy({ set });

    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith("trust proxy", 1);
  });
});
