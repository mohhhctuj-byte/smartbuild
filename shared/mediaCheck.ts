export const MEDIA_CHECK_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MEDIA_CHECK_MAX_IMAGE_BATCH = 5;
export const MEDIA_CHECK_MAX_VIDEO_BYTES = 25 * 1024 * 1024;
export const MEDIA_CHECK_MAX_IMAGE_EDGE = 4096;
export const MEDIA_CHECK_MAX_IMAGE_PIXELS = 16_000_000;
export const MEDIA_CHECK_MAX_VIDEO_WIDTH = 1920;
export const MEDIA_CHECK_MAX_VIDEO_HEIGHT = 1080;
export const MEDIA_CHECK_MAX_VIDEO_SECONDS = 10 * 60;

export function isMediaCheckVideoDimensionsSupported(width: number, height: number) {
  return (width <= MEDIA_CHECK_MAX_VIDEO_WIDTH && height <= MEDIA_CHECK_MAX_VIDEO_HEIGHT)
    || (width <= MEDIA_CHECK_MAX_VIDEO_HEIGHT && height <= MEDIA_CHECK_MAX_VIDEO_WIDTH);
}

export const MEDIA_CHECK_PREVIEW_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export const MEDIA_CHECK_ANALYSIS_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const MEDIA_CHECK_VIDEO_TYPES = ["video/mp4"] as const;

export const MEDIA_CHECK_RESPONSE_LANGUAGES = [
  { value: "Arabic", label: "العربية (Arabic)" },
  { value: "English", label: "English" },
  { value: "French", label: "Français (French)" },
  { value: "Spanish", label: "Español (Spanish)" },
  { value: "German", label: "Deutsch (German)" },
  { value: "Turkish", label: "Türkçe (Turkish)" },
] as const;

export type MediaCheckResponseLanguage = typeof MEDIA_CHECK_RESPONSE_LANGUAGES[number]["value"];

export function detectMediaCheckResponseLanguage(text: string): MediaCheckResponseLanguage {
  let arabicLetters = 0;
  let latinLetters = 0;
  for (const character of text) {
    const codePoint = character.codePointAt(0) || 0;
    if ((codePoint >= 0x0600 && codePoint <= 0x06ff)
      || (codePoint >= 0x0750 && codePoint <= 0x077f)
      || (codePoint >= 0x08a0 && codePoint <= 0x08ff)
      || (codePoint >= 0xfb50 && codePoint <= 0xfdff)
      || (codePoint >= 0xfe70 && codePoint <= 0xfeff)) {
      arabicLetters += 1;
    } else if ((codePoint >= 0x0041 && codePoint <= 0x005a)
      || (codePoint >= 0x0061 && codePoint <= 0x007a)) {
      latinLetters += 1;
    }
  }
  return arabicLetters > latinLetters ? "Arabic" : latinLetters > 0 ? "English" : "Arabic";
}

export const MEDIA_CHECK_LIMITS = {
  imageBytes: MEDIA_CHECK_MAX_IMAGE_BYTES,
  imageBatch: MEDIA_CHECK_MAX_IMAGE_BATCH,
  videoBytes: MEDIA_CHECK_MAX_VIDEO_BYTES,
  imageTypes: MEDIA_CHECK_PREVIEW_IMAGE_TYPES,
  analysisImageTypes: MEDIA_CHECK_ANALYSIS_IMAGE_TYPES,
  videoTypes: MEDIA_CHECK_VIDEO_TYPES,
  imageMaxEdge: MEDIA_CHECK_MAX_IMAGE_EDGE,
  imageMaxPixels: MEDIA_CHECK_MAX_IMAGE_PIXELS,
  videoMaxWidth: MEDIA_CHECK_MAX_VIDEO_WIDTH,
  videoMaxHeight: MEDIA_CHECK_MAX_VIDEO_HEIGHT,
  videoMaxSeconds: MEDIA_CHECK_MAX_VIDEO_SECONDS,
} as const;
