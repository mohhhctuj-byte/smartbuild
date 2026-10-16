import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { AIImageCheckEntry, inspectVideo } from "./AIImageCheckEntry";

function mockVideo(mode: "valid" | "loadeddata" | "metadata-only" | "unsupported-codec" | "decode-failed" | "timeout") {
  const listeners = new Map<string, Set<EventListener>>();
  const video = {
    preload: "",
    muted: false,
    readyState: 0,
    duration: 2,
    videoWidth: 640,
    videoHeight: 360,
    HAVE_METADATA: 1,
    error: null as { code: number } | null,
    src: "",
    addEventListener(type: string, listener: EventListener) {
      const handlers = listeners.get(type) || new Set<EventListener>();
      handlers.add(listener);
      listeners.set(type, handlers);
    },
    removeEventListener(type: string, listener: EventListener) {
      listeners.get(type)?.delete(listener);
    },
    dispatch(type: string) {
      listeners.get(type)?.forEach(listener => listener(new Event(type)));
    },
    removeAttribute() {},
    load() {},
  };

  Object.defineProperty(video, "src", {
    set() {
      if (mode === "timeout") return;
      if (mode === "unsupported-codec" || mode === "decode-failed") {
        video.error = { code: mode === "unsupported-codec" ? 4 : 3 };
        video.dispatch("error");
        return;
      }
      if (mode === "loadeddata") {
        video.duration = 2;
        video.videoWidth = 640;
        video.videoHeight = 360;
        video.readyState = 2;
        video.dispatch("loadeddata");
      } else {
        video.readyState = 1;
        video.dispatch("loadedmetadata");
        if (mode === "valid") {
          video.readyState = 2;
          video.dispatch("loadeddata");
        }
      }
    },
  });

  vi.stubGlobal("document", { createElement: () => video });
  vi.stubGlobal("window", {
    setTimeout: (callback: TimerHandler) => globalThis.setTimeout(callback, mode === "timeout" || mode === "metadata-only" ? 0 : 15_000),
    clearTimeout: (timer: number) => globalThis.clearTimeout(timer),
  });
  vi.stubGlobal("HTMLMediaElement", { HAVE_METADATA: 1 });
  vi.stubGlobal("MediaError", { MEDIA_ERR_DECODE: 3, MEDIA_ERR_SRC_NOT_SUPPORTED: 4 });
  return video;
}

afterEach(() => vi.unstubAllGlobals());

describe("AI Image Check media entry", () => {
  it("keeps the empty media picker accessible and shows no fabricated analysis result", () => {
    const markup = renderToStaticMarkup(createElement(AIImageCheckEntry, {
      onAskAboutImage: () => {},
    }));

    expect(markup).toContain("Can this image be trusted?");
    expect(markup).toContain('id="ai-image-check-file"');
    expect(markup).toContain('aria-label="Choose up to five images or one MP4 video to check"');
    expect(markup).toContain('accept="image/jpeg,image/png,image/webp,image/gif,video/mp4"');
    expect(markup).toContain('for="ai-image-check-file"');
    expect(markup).toContain("Images: JPEG, PNG, WebP");
    expect(markup).toContain("GIF preview only");
    expect(markup).toContain("MP4");
    expect(markup).toContain("up to 5 MB");
    expect(markup).not.toContain("Provenance check · C2PA");
    expect(markup).not.toContain("No credentials found");
    expect(markup).not.toContain("Missing Content Credentials");
    expect(markup).not.toContain("AI-generation clues found");
    expect(markup).not.toContain("No strong AI-generation clues found");
    expect(markup).not.toContain("Analyze video");
    expect(markup).not.toContain("Content observations</h2>");
  });

  it("confirms Gemini upload and keeps the optional question field prominent", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "client/src/components/AIImageCheckEntry.tsx"), "utf8");
    expect(source).not.toContain("Result and reply language");
    expect(source).not.toContain("Detected reply language:");
    expect(source).not.toContain('id="ai-image-check-language"');
    expect(source).toContain("const responseLanguage = detectMediaCheckResponseLanguage(question);");
    expect(source).toContain('formData.append("responseLanguage", responseLanguage);');
    expect(source).not.toContain("Provenance check · C2PA");
    expect(source).not.toContain("C2PA checks provenance; no AI-generation detector is connected");
    expect(source).not.toContain("Ask how image checks work");
    expect(source).not.toContain("Provenance check:");
    expect(source).not.toContain("Analyze sends this file to Google Gemini for content understanding");
    expect(source).not.toContain("window.confirm");
    expect(source).not.toContain("To analyze this file, it will be sent to Google Gemini");
    expect(source).not.toContain("To analyze this file, it will be sent to Hive");
    expect(source).toContain('selectedBatch.length > 1 ? `these ${selectedBatch.length} images` : "this file"');
    expect(source).toContain('"it will be"} uploaded to the Google Gemini API for 2–4 separate reviews.');
    expect(source).toContain("The media is reviewed in 2–4 separate Gemini requests");
    expect(source).not.toContain("The media is not sent to Gemini");
    expect(source).not.toContain("Videos use three sampled frames per review");
    expect(source).toContain('aria-label="Confirm media analysis"');
    expect(source).toContain("const [analysisConfirmationPending, setAnalysisConfirmationPending] = useState(false);");
    expect(source).toContain("onClick={proceedWithAnalysis}");
    expect(source).toContain("const confirmAnalysis = () =>");
    expect(source).toContain("onClick={confirmAnalysis}");
    expect(source).toContain("AI-generated visual estimate (not calibrated)");
    expect(source).toContain("AI-generated");
    expect(source).toContain("Likely real / not AI-generated");
    expect(source).toContain("50/100 is a neutral score, not a finding that the media is half AI-generated.");
    expect(source).toContain("Add more images");
    expect(source).toContain("Analyzing image {analysisProgress.current} of {analysisProgress.total}");
    expect(source).toContain("batchResults.map(({ selectionId, fileName, result })");
    expect(source).toContain("100 - estimate.aiGeneratedLikelihoodPercent");
    expect(source).toContain("<details className=\"rounded-lg border border-white/10 bg-black/15 p-3\">");
    expect(source).toContain("result.contentUnderstanding.observations.slice(0, 4)");
    expect(source).not.toContain("Both values are Gemini’s visual impression");
    expect(source).not.toContain("Mean estimate across");
    expect(source).toContain("Inconclusive — Gemini found no clear visual evidence");
    expect(source).toContain("result.contentUnderstanding.aiGenerationEstimate");
    expect(source).not.toContain("Hive didn’t return an AI-generation estimate.");
    expect(source).toContain("Explain the visual estimate and observed cues in plain language");
    expect(source).toContain("Images and videos are analyzed with Google Gemini after you confirm upload.");
    expect(source).not.toContain("Data handling and check details");
    expect(source).not.toContain("Review Google Gemini API terms");
    expect(source).toContain('aria-label="Optional question about this image or video"');
    expect(source).toContain("min-h-32 w-full");
    expect(source).toContain("text-base leading-7");
    expect(source).toContain("placeholder:text-slate-400");
    expect(source).not.toContain("Provider: {analysis.result.contentUnderstanding.provider}");
    expect(source).not.toContain("Response language: {analysis.result.contentUnderstanding.responseLanguage}");
    expect(source).toContain("This MP4 could not be played in this browser, so its video details could not be checked and analysis was not started.");
    expect(source).not.toContain("This video uses a codec that is not supported.");
  });

  it("loads video listeners before the source and resolves once a decoded frame is available", async () => {
    const video = mockVideo("valid");
    await expect(inspectVideo("blob:valid-mp4")).resolves.toEqual({ duration: 2, width: 640, height: 360 });
    expect(video.preload).toBe("auto");
  });

  it("uses loadeddata when it arrives without loadedmetadata", async () => {
    const video = mockVideo("loadeddata");
    await expect(inspectVideo("blob:loadeddata-mp4")).resolves.toEqual({ duration: 2, width: 640, height: 360 });
  });

  it("rejects browser-unsupported MP4 codecs with a distinct error", async () => {
    mockVideo("unsupported-codec");
    await expect(inspectVideo("blob:unsupported-mp4")).rejects.toThrow("unsupported-codec");
  });

  it("distinguishes a browser decode failure from an unsupported codec", async () => {
    mockVideo("decode-failed");
    await expect(inspectVideo("blob:decode-failed-mp4")).rejects.toThrow("decode-failed");
  });

  it("rejects videos at the ten-minute duration and dimension limits", async () => {
    const validDurationVideo = mockVideo("valid");
    validDurationVideo.duration = 599;
    await expect(inspectVideo("blob:valid-duration-mp4")).resolves.toMatchObject({ duration: 599 });

    const durationVideo = mockVideo("valid");
    durationVideo.duration = 600;
    await expect(inspectVideo("blob:too-long-mp4")).rejects.toThrow("duration");

    const dimensionVideo = mockVideo("valid");
    dimensionVideo.videoWidth = 1921;
    await expect(inspectVideo("blob:too-wide-mp4")).rejects.toThrow("dimensions");
  });

  it("accepts portrait video within the same 1920x1080 resolution limits", async () => {
    const video = mockVideo("valid");
    video.videoWidth = 1080;
    video.videoHeight = 1920;
    await expect(inspectVideo("blob:portrait-mp4")).resolves.toEqual({ duration: 2, width: 1080, height: 1920 });
  });

  it("bounds video metadata loading with a timeout", async () => {
    mockVideo("timeout");
    await expect(inspectVideo("blob:stalled-mp4")).rejects.toThrow("timeout");
  });

  it("does not mark preview ready on metadata alone when no frame can be decoded", async () => {
    mockVideo("metadata-only");
    await expect(inspectVideo("blob:metadata-only-mp4")).rejects.toThrow("timeout");
  });
});
