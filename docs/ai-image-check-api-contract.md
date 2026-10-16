# AI Image Check media-analysis contract

## Gemini analysis

After the user confirms analysis, the browser uploads the media to the SmartBuild server, which uploads it to the Google Gemini API using a server-side API key. The interface discloses this transfer before upload. Gemini's API terms and quotas apply. The server deletes the uploaded Gemini file when analysis finishes if the API accepts the deletion; otherwise Google's file-retention policy applies. API keys are never returned to the browser. If users connect to a remotely hosted SmartBuild server, the selected file is sent first to that server and then to Google for analysis.

The model returns a 0–100 AI-generated visual estimate and a short explanation from visible cues. The interface displays the arithmetic complement as “likely real / not AI-generated”; it is not an independent measure or proof of authenticity. Both values are an uncalibrated language-model impression, not a detector probability, forensic finding, or proof of how media was created.

Each image or video receives 2–4 separate, sequential Gemini requests with a different review focus. The media file is uploaded once and referenced in each request; the requests are separate model reviews, not independent detectors. At least two reviews run. The server stops at two or more when estimates are within 12 points and every review reports at least 75% subjective clarity, or when every score is neutral 50; otherwise it continues up to four. A neutral mean or wide disagreement is presented as inconclusive. The provider upload is cleaned up after the reviews.

The server separately runs the `@contentauth/c2pa-node` reader on received bytes to check embedded Content Credentials and signed provenance. The check does not establish whether depicted events are true; missing credentials do not show whether media is authentic or AI-generated. Remote credential references are not fetched, and signer trust is not established solely by a `Valid` result.

## Supported media and validation

The backend and UI share limits from `shared/mediaCheck.ts`:

| Use | Accepted types | Maximum size | Other limits |
|---|---|---:|---|
| Local image preview | JPEG, PNG, WebP, GIF | 5 MiB | GIF is preview-only |
| Image content understanding | JPEG, PNG, WebP | 5 MiB | Long edge at most 4096 px; at most 16 megapixels |
| Video preview and content understanding | MP4 | 25 MiB | Under 10 minutes; at most 1920×1080 in either orientation |

The interface accepts up to five images in one selection and analyzes them sequentially as separate API jobs. Videos remain single-file selections and cannot be mixed with images. The server API accepts one media file per request.

The server authenticates a verified SmartBuild account before reading the body, applies byte limits while streaming, checks the filename extension, declared MIME type, and actual file signature, and parses image dimensions and MP4 codec labels, dimensions, and duration before analysis. Supported video entries include H.264, H.265, VP9, AV1, and MPEG-4 video, plus supported audio entries. This container inspection is not a full decode.

Image and video bytes are held in server memory for upload and cleared when the request settles. For video, the original MP4 is uploaded to Gemini; the application does not extract a few frames first. Gemini receives the video input and may return timestamped findings. Videos must be shorter than 10 minutes and no larger than 25 MiB.

## Provider configuration and capacity

The `GET /api/media-check/config` route verifies that the configured Gemini API key is accepted and that a configured Gemini model is available. If Gemini is unavailable, the endpoint reports analysis as not ready; it does not fall back to a local model.

Gemini API quotas and rate limits apply. The server also limits concurrent analysis to one active job per account and four active jobs per process.

Configure a Gemini API key on the SmartBuild server:

```dotenv
GEMINI_API_KEY=...
# Optional: comma-separated keys and models
GEMINI_API_KEYS=...
GEMINI_MODEL=gemini-3.5-flash-lite
GEMINI_MODELS=gemini-3.5-flash-lite,gemini-2.5-flash
```

`GEMINI_API_KEY` or `GEMINI_API_KEYS` must be configured on the server. The model is checked against models available to the key. `GET /api/media-check/config` never returns credentials.

## Routes

### Read active provider and limits

```http
GET /api/media-check/config
```

Returns Gemini readiness and model name, C2PA verifier availability, supported types, and active file limits. It does not expose secrets.

### Start content understanding

```http
POST /api/media-check
Content-Type: multipart/form-data
Cookie: <verified SmartBuild session>
```

The multipart body contains one required `media` file, an optional `responseLanguage` from the supported language list (defaults to Arabic), and an optional `question` of at most 500 characters. The browser sends the file after the user confirms analysis. A successful request returns `202` with a server-generated `jobId` and `status: "queued"`.

### Poll a job

```http
GET /api/media-check/{jobId}
Cookie: <verified SmartBuild session>
```

Jobs are in-memory, account-scoped, and expire after 15 minutes. The endpoint returns a completed result such as:

```json
{
  "jobId": "server-generated-id",
  "status": "completed",
  "result": {
    "mediaType": "image",
    "contentUnderstanding": {
      "status": "completed",
      "provider": "Google Gemini API",
      "model": "gemini-3.5-flash-lite",
      "responseLanguage": "Arabic",
      "summary": "Cautious description of observable content.",
      "observations": ["Observable detail"],
      "timestampFindings": [],
      "reviewPasses": [
        {
          "method": "Scene and lighting consistency",
          "aiGeneratedLikelihoodPercent": 62,
          "selfAssessedConfidencePercent": 80,
          "explanation": "Some visible cues look synthetic."
        },
        {
          "method": "Fine-detail inspection",
          "aiGeneratedLikelihoodPercent": 62,
          "selfAssessedConfidencePercent": 78,
          "explanation": "The same cues remain visible."
        }
      ],
      "aiGenerationEstimate": {
        "aiGeneratedLikelihoodPercent": 62,
        "explanation": "A cautious, uncalibrated visual impression."
      },
      "providerFileCleanup": "deleted"
    },
    "authenticity": {
      "status": "inconclusive",
      "summary": "The Gemini visual estimate and C2PA provenance check are separate.",
      "checks": [
        {
          "id": "c2pa_provenance",
          "status": "not_found",
          "summary": "No Content Credentials were found."
        }
      ]
    },
    "limitations": [
      "Gemini's AI-generation estimate is an uncalibrated visual impression and can be mistaken; it is not proof of authenticity or how media was created."
    ]
  }
}
```

Model observations and estimates are returned in the selected response language. Each review returns integer estimate and subjective clarity values from 0 through 100. The server rejects malformed model responses and does not expose raw model payloads. The overall estimate is the arithmetic mean of 2–4 reviews. C2PA status is independent from the visual estimate and never provides an AI-generation verdict.

## Safe failures

The API returns explicit errors for unsupported or mismatched media, invalid media, size/dimension/duration/codec violations, unauthenticated access, busy server capacity, unavailable Gemini configuration, Gemini rate limits, upload or analysis timeouts, model failures, and expired jobs. A failed response never contains a successful result or raw provider payload.

The server dependency `@contentauth/c2pa-node` requires its matching platform binary. On a fresh Windows pnpm install where dependency scripts are blocked, approve its install script so the verifier can load. A missing C2PA verifier does not block Gemini visual analysis.
