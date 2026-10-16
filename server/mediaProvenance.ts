import { Context, Reader } from "@contentauth/c2pa-node";

export type MediaProvenanceCheck = {
  id: "c2pa_provenance";
  status: "verified" | "present_unverified" | "not_found" | "invalid" | "unavailable" | "failed";
  summary: string;
};

const verifierContext = new Context({
  verify: {
    verifyAfterReading: true,
    verifyTrust: true,
    verifyTimestampTrust: false,
    ocspFetch: false,
    remoteManifestFetch: false,
  },
  trust: { verifyTrustList: false },
});

const verifierProbePng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAF0lEQVR4nGP4z8Dwn4ECwESJ5lEDBgAAlQIH/3yKx4sAAAAASUVORK5CYII=",
  "base64",
);

let readiness: Promise<boolean> | undefined;

export function isMediaProvenanceVerifierReady() {
  readiness ??= Reader.fromAsset({ buffer: verifierProbePng, mimeType: "image/png" }, verifierContext)
    .then(() => true)
    .catch(error => {
      const errorName = error instanceof Error ? error.name : "UnknownError";
      console.warn("[MediaCheck] C2PA provenance verifier is unavailable.", errorName);
      return false;
    });
  return readiness;
}

export async function verifyMediaProvenance(bytes: Buffer, mimeType: string): Promise<MediaProvenanceCheck> {
  if (!(await isMediaProvenanceVerifierReady())) {
    return {
      id: "c2pa_provenance",
      status: "unavailable",
      summary: "The C2PA Content Credentials verifier is unavailable in this server environment.",
    };
  }

  try {
    const reader = await Reader.fromAsset({ buffer: bytes, mimeType }, verifierContext);
    if (!reader) {
      return {
        id: "c2pa_provenance",
        status: "not_found",
        summary: "No Content Credentials were found in this file. Their absence does not show whether the media is authentic or AI-generated.",
      };
    }

    const manifestStore = reader.json();
    if (!reader.isEmbedded() && reader.remoteUrl()) {
      return {
        id: "c2pa_provenance",
        status: "unavailable",
        summary: "This file references remote Content Credentials. SmartBuild did not fetch external credentials, so they could not be verified.",
      };
    }
    if (!reader.getActive()) {
      return {
        id: "c2pa_provenance",
        status: "failed",
        summary: "Content Credentials data was present, but no active provenance claim could be read.",
      };
    }

    if (manifestStore.validation_state === "Trusted") {
      return {
        id: "c2pa_provenance",
        status: "verified",
        summary: "The C2PA provenance claim passed the available integrity and trust checks. This verifies signed provenance data only; it does not prove that the depicted scene is true.",
      };
    }
    if (manifestStore.validation_state === "Valid") {
      return {
        id: "c2pa_provenance",
        status: "present_unverified",
        summary: "The C2PA provenance claim passed integrity checks, but signer trust was not established. This does not prove that the depicted scene is true.",
      };
    }
    if (manifestStore.validation_state === "Invalid") {
      return {
        id: "c2pa_provenance",
        status: "invalid",
        summary: "Content Credentials were present, but C2PA validation reported an integrity or signature problem. The credentials are not verified.",
      };
    }

    return {
      id: "c2pa_provenance",
      status: "failed",
      summary: "Content Credentials were present, but their validation state could not be established.",
    };
  } catch (error) {
    const errorName = error instanceof Error ? error.name : "UnknownError";
    console.warn("[MediaCheck] C2PA provenance verification failed.", errorName);
    return {
      id: "c2pa_provenance",
      status: "failed",
      summary: "The C2PA Content Credentials check could not be completed for this file.",
    };
  }
}
