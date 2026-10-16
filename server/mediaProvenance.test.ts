import { describe, expect, it } from "vitest";
import { isMediaProvenanceVerifierReady, verifyMediaProvenance } from "./mediaProvenance";

const syntheticPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAIAAABvFaqvAAAALElEQVR4nGOUa7rDQA3ARBVTGEYNIgaMBjZhMBpGhMFoGBEGo2FEGAy+MAIA0JgBrJsvigwAAAAASUVORK5CYII=",
  "base64",
);

describe("C2PA media provenance verification", () => {
  it("loads the native verifier and reports missing credentials without making an authenticity claim", async () => {
    await expect(isMediaProvenanceVerifierReady()).resolves.toBe(true);
    await expect(verifyMediaProvenance(syntheticPng, "image/png")).resolves.toEqual({
      id: "c2pa_provenance",
      status: "not_found",
      summary: "No Content Credentials were found in this file. Their absence does not show whether the media is authentic or AI-generated.",
    });
  });
});
