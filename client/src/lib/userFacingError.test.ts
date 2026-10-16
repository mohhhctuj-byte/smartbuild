import { describe, expect, it } from "vitest";
import { userFacingError } from "./userFacingError";

describe("userFacingError", () => {
  it("replaces production task and path-scope codes with a clear retry message", () => {
    expect(userFacingError(
      new Error("PRODUCTION_AGENT_TASK_FAILED: AGENT_PATH_SCOPE_DENIED"),
      "Request failed.",
    )).toContain("تعذر إكمال الطلب");
  });

  it("hides other machine-readable failure codes", () => {
    expect(userFacingError("PREVIEW_CONTENT_INVALID", "Request failed.")).toContain("تعذر إكمال الطلب");
  });

  it("explains how to continue when a Claude build hits an account limit", () => {
    expect(userFacingError(
      "PRODUCTION_AGENT_TASK_FAILED: ANTHROPIC_RATE_LIMITED",
      "Build failed.",
    )).toContain("Wait for it to reset, or switch to SM+3.1 Pro and resend");
  });

  it("explains that Claude chat needs a configured Anthropic key", () => {
    const message = userFacingError(
      "ANTHROPIC_API_KEY_NOT_CONFIGURED: Claude Sonnet 5.5 is selected, but ANTHROPIC_API_KEY is not configured on the server.",
      "Request failed.",
    );
    expect(message).toContain("مفتاح Anthropic");
    expect(message).toContain("ANTHROPIC_API_KEY");
    expect(message).not.toContain("مشكلة داخلية");
  });

  it("explains billing limits without hiding the conversation", () => {
    expect(userFacingError(
      "PRODUCTION_AGENT_TASK_FAILED: ANTHROPIC_BILLING_REQUIRED",
      "Build failed.",
    )).toContain("billing or spend limit");
  });

  it("explains Gemini quota and timeout failures instead of hiding them as internal errors", () => {
    expect(userFacingError("PRODUCTION_AGENT_TASK_FAILED: GEMINI_STRUCTURED_HTTP_429", "Build failed."))
      .toContain("Gemini API usage or rate limit");
    expect(userFacingError("PRODUCTION_AGENT_TASK_TIMED_OUT: AGENT_OUTPUT_CONTINUATION_TIMED_OUT", "Build failed."))
      .toContain("reached its time limit");
  });

  it("replaces the old empty-provider failure with a clear retry message", () => {
    const message = userFacingError(
      "The configured AI provider returned an empty response. Try again or check the provider's model configuration.",
      "Request failed.",
    );
    expect(message).toContain("did not return a reply");
    expect(message).not.toContain("configured AI provider returned an empty response");
  });

  it("replaces the old generic AI connection fallback", () => {
    expect(userFacingError(
      "I could not reach the AI service just now. Please try again",
      "Request failed.",
    )).toBe("The AI service could not complete this reply. Your message is saved; please try again.");
  });

  it("preserves understandable messages and uses a fallback when no message exists", () => {
    expect(userFacingError(new Error("Please try again."), "Request failed.")).toBe("Please try again.");
    expect(userFacingError(null, "Request failed.")).toBe("Request failed.");
  });

  it("explains how to recover when the browser cannot reach the local server", () => {
    expect(userFacingError(new TypeError("Failed to fetch"), "Request failed."))
      .toContain("http://localhost:3002");
  });
});
