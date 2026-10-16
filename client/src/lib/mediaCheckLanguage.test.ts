import { describe, expect, it } from "vitest";
import { detectMediaCheckResponseLanguage } from "@shared/mediaCheck";

describe("media-check reply language detection", () => {
  it("matches Arabic questions to Arabic replies", () => {
    expect(detectMediaCheckResponseLanguage("ما الذي يظهر في هذه الصورة؟")).toBe("Arabic");
  });

  it("matches English questions to English replies", () => {
    expect(detectMediaCheckResponseLanguage("What is visible in this image?")).toBe("English");
  });

  it("uses the predominant language in a mixed Arabic and English question", () => {
    expect(detectMediaCheckResponseLanguage("ما هذا الذي يظهر في الصورة؟ What?")).toBe("Arabic");
    expect(detectMediaCheckResponseLanguage("What are the colors shown here? ما الألوان؟")).toBe("English");
  });

  it("defaults to Arabic when the question contains no Arabic or Latin letters", () => {
    expect(detectMediaCheckResponseLanguage("123?!")).toBe("Arabic");
    expect(detectMediaCheckResponseLanguage("")).toBe("Arabic");
  });
});
