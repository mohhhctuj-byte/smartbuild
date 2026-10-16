import { describe, expect, it } from "vitest";
import { findSpeechVoice, italianLetterName, speechLanguageForText, speechTextFromMarkdown } from "./textToSpeech";

describe("chat text-to-speech helpers", () => {
  it("detects Arabic text for automatic speech language", () => {
    expect(speechLanguageForText("مرحبا بك", "auto")).toBe("ar-EG");
    expect(speechLanguageForText("Hello there", "auto")).toBe("en-US");
    expect(speechLanguageForText("A", "auto", "Italian alphabet: Le Vocali and consonanti")).toBe("it-IT");
    expect(speechLanguageForText("مرحبا", "en-GB")).toBe("en-GB");
  });

  it("maps each Italian alphabet letter to its Italian letter name, not surrounding explanation", () => {
    expect(italianLetterName("A")).toBe("a");
    expect(italianLetterName("h")).toBe("acca");
    expect(italianLetterName("W")).toBe("doppia vu");
    expect(italianLetterName("1")).toBeNull();
    expect(speechLanguageForText(italianLetterName("C") || "", "auto", "Italian alphabet")).toBe("it-IT");
  });

  it("chooses the requested accent voice and falls back within its language", () => {
    const voices = [
      { lang: "en-AU" },
      { lang: "en-GB" },
      { lang: "ar-SA" },
    ] as SpeechSynthesisVoice[];
    expect(findSpeechVoice(voices, "en-GB")?.lang).toBe("en-GB");
    expect(findSpeechVoice(voices, "ar-EG")).toBeUndefined();
    expect(findSpeechVoice(voices, "ar-EG", true)?.lang).toBe("ar-SA");
    expect(findSpeechVoice(voices, "fr-FR")).toBeUndefined();
  });

  it("removes common Markdown syntax before reading a reply aloud", () => {
    expect(speechTextFromMarkdown("## Hello **there**\nSee [docs](https://example.com) and `code`."))
      .toBe("Hello there See docs and code.");
  });
});
