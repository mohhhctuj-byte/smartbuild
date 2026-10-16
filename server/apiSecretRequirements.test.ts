import { describe, expect, it } from "vitest";
import { apiSecretRequirementForBuild } from "./apiSecretRequirements";

describe("build API secret requirements", () => {
  it("requests a scoped key for explicit external provider features", () => {
    expect(apiSecretRequirementForBuild("Add real payment processing with Stripe.")).toMatchObject({
      provider: "Stripe",
      name: "STRIPE_SECRET_KEY",
    });
    expect(apiSecretRequirementForBuild("Send email notifications using SMTP.")).toMatchObject({
      provider: "Email provider",
      name: "EMAIL_PROVIDER_API_KEY",
    });
    expect(apiSecretRequirementForBuild("أضف دفع إلكتروني حقيقي")).toMatchObject({ provider: "Stripe" });
  });

  it("does not request credentials for local demo behavior or ordinary UI mentions", () => {
    expect(apiSecretRequirementForBuild("Build a mock Stripe checkout UI with demo data.")).toBeNull();
    expect(apiSecretRequirementForBuild("Build a live Stripe checkout with a mock-data fallback.")).toMatchObject({ provider: "Stripe" });
    expect(apiSecretRequirementForBuild("Build an API key settings page.")).toBeNull();
    expect(apiSecretRequirementForBuild("Create a contact form without external services.")).toBeNull();
    expect(apiSecretRequirementForBuild("Build a landing page about OpenAI.")).toBeNull();
  });

  it("explains that saving does not activate an unverified integration", () => {
    expect(apiSecretRequirementForBuild("Use the OpenAI API").question).toContain("does not activate");
  });
});
