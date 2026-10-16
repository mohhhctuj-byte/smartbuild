import { describe, expect, it } from "vitest";
import { createDesignAgentCollaboration, DESIGN_AGENT_ID, designAgentInstruction, designAgentQualityBrief } from "./designAgentGateway";

describe("design agent gateway", () => {
  it("declares the visual specialist as a Builder Agent collaborator", () => {
    expect(createDesignAgentCollaboration()).toEqual({
      agentId: DESIGN_AGENT_ID,
      name: "Visual Design Director",
      role: "design",
      collaboratesWith: "smartbuild-builder-agent",
      requiredChecks: [
        "design-concept-is-product-specific",
        "visual-identity-is-visible-in-first-viewport",
        "typography-and-type-scale",
        "semantic-color-tokens",
        "domain-appropriate-content-and-composition",
        "spacing-and-layout-rhythm",
        "responsive-mobile-desktop",
        "interactive-focus-hover-active-states",
        "accessible-contrast-and-touch-targets",
        "rtl-and-arabic-support-when-requested",
        "loading-empty-error-success-states",
        "reduced-motion-support",
        "iteration-preserves-unrequested-visual-direction",
        "visual-regression-preview-evidence",
      ],
    });
  });

  it("requires modern, verifiable design work", () => {
    expect(designAgentInstruction()).toContain("Never use a generic dashboard");
    expect(designAgentInstruction()).toContain("visual evidence");
    expect(designAgentInstruction()).toContain("preserve the existing stylesheet");
    expect(designAgentQualityBrief()).toContain("typography-and-type-scale");
    expect(designAgentQualityBrief()).toContain("visual-regression-preview-evidence");
  });
});
