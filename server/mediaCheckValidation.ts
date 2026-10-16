import {
  MEDIA_CHECK_ANALYSIS_IMAGE_TYPES,
  MEDIA_CHECK_MAX_IMAGE_EDGE,
  MEDIA_CHECK_MAX_IMAGE_PIXELS,
  MEDIA_CHECK_MAX_IMAGE_BYTES,
  MEDIA_CHECK_MAX_VIDEO_BYTES,
  MEDIA_CHECK_MAX_VIDEO_HEIGHT,
  MEDIA_CHECK_MAX_VIDEO_SECONDS,
  MEDIA_CHECK_MAX_VIDEO_WIDTH,
  MEDIA_CHECK_VIDEO_TYPES,
  isMediaCheckVideoDimensionsSupported,
} from "@shared/mediaCheck";

export type MediaCheckValidationError =
  | "unsupported_type"
  | "type_mismatch"
  | "too_large"
  | "empty"
  | "invalid_media"
  | "duration_exceeded"
  | "dimensions_exceeded";

export type ValidatedMedia = {
  mimeType: (typeof MEDIA_CHECK_ANALYSIS_IMAGE_TYPES)[number] | (typeof MEDIA_CHECK_VIDEO_TYPES)[number];
  mediaType: "image" | "video";
  durationSeconds?: number;
  width: number;
  height: number;
};

type Box = { type: string; start: number; end: number };

function readU16(bytes: Buffer, offset: number) {
  return offset + 2 <= bytes.length ? bytes.readUInt16BE(offset) : null;
}

function readU32(bytes: Buffer, offset: number) {
  return offset + 4 <= bytes.length ? bytes.readUInt32BE(offset) : null;
}

function boxes(bytes: Buffer, start: number, end: number): Box[] | null {
  const result: Box[] = [];
  let offset = start;
  while (offset < end) {
    if (offset + 8 > end) return null;
    let size = readU32(bytes, offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    let headerSize = 8;
    if (size === 1) {
      if (offset + 16 > end) return null;
      const extendedSize = bytes.readBigUInt64BE(offset + 8);
      if (extendedSize > BigInt(Number.MAX_SAFE_INTEGER)) return null;
      size = Number(extendedSize);
      headerSize = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size === null || size < headerSize || offset + size > end) return null;
    result.push({ type, start: offset, end: offset + size });
    offset += size;
  }
  return offset === end ? result : null;
}

function childBoxes(bytes: Buffer, box: Box) {
  return boxes(bytes, box.start + (bytes.readUInt32BE(box.start) === 1 ? 16 : 8), box.end);
}

function findBox(bytes: Buffer, parent: Box, type: string) {
  return childBoxes(bytes, parent)?.find(box => box.type === type) ?? null;
}

function imageDimensions(bytes: Buffer, mimeType: string) {
  if (mimeType === "image/png" && bytes.length >= 24
    && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    && bytes.toString("ascii", 12, 16) === "IHDR") {
    return { width: readU32(bytes, 16), height: readU32(bytes, 20) };
  }

  if (mimeType === "image/jpeg" && bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) return null;
      while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      const length = readU16(bytes, offset);
      if (length === null || length < 2 || offset + length > bytes.length) return null;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { width: readU16(bytes, offset + 5), height: readU16(bytes, offset + 3) };
      }
      offset += length;
    }
  }

  if (mimeType === "image/webp" && bytes.length >= 30
    && bytes.toString("ascii", 0, 4) === "RIFF"
    && bytes.toString("ascii", 8, 12) === "WEBP") {
    const chunkType = bytes.toString("ascii", 12, 16);
    if (chunkType === "VP8X") {
      return {
        width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
        height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
      };
    }
    if (chunkType === "VP8 " && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
    }
    if (chunkType === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
      const b1 = bytes[21];
      const b2 = bytes[22];
      const b3 = bytes[23];
      const b4 = bytes[24];
      return {
        width: 1 + b1 + ((b2 & 0x3f) << 8),
        height: 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10)),
      };
    }
  }
  return null;
}

function parseMp4(bytes: Buffer) {
  const top = boxes(bytes, 0, bytes.length);
  if (!top?.some(box => box.type === "ftyp")) return null;
  const moov = top.find(box => box.type === "moov");
  if (!moov) return null;
  const mvhd = findBox(bytes, moov, "mvhd");
  if (!mvhd) return null;
  const version = bytes[mvhd.start + 8];
  const timescaleOffset = mvhd.start + (version === 1 ? 28 : 20);
  const durationOffset = timescaleOffset + 4;
  const timescale = readU32(bytes, timescaleOffset);
  let duration: number | null = null;
  if (version === 1) {
    if (durationOffset + 8 <= mvhd.end) {
      const value = bytes.readBigUInt64BE(durationOffset);
      if (value <= BigInt(Number.MAX_SAFE_INTEGER)) duration = Number(value);
    }
  } else {
    duration = readU32(bytes, durationOffset);
  }
  if (!timescale || duration === null || duration === 0xffffffff) return null;
  const durationSeconds = duration / timescale;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;

  const tracks = childBoxes(bytes, moov)?.filter(box => box.type === "trak") ?? [];
  let video: { width: number; height: number } | null = null;
  for (const track of tracks) {
    const mdia = findBox(bytes, track, "mdia");
    const hdlr = mdia && findBox(bytes, mdia, "hdlr");
    const handler = hdlr ? bytes.toString("ascii", hdlr.start + 16, hdlr.start + 20) : "";
    if (handler !== "vide" && handler !== "soun") continue;
    const minf = mdia && findBox(bytes, mdia, "minf");
    const stbl = minf && findBox(bytes, minf, "stbl");
    const stsd = stbl && findBox(bytes, stbl, "stsd");
    if (!stsd || stsd.start + 16 > stsd.end) return null;
    const count = readU32(bytes, stsd.start + 12);
    if (count !== 1) return null;
    const sampleEntry = boxes(bytes, stsd.start + 16, stsd.end)?.[0];
    if (!sampleEntry) return null;
    if (handler === "vide") {
      const width = readU16(bytes, sampleEntry.start + 32);
      const height = readU16(bytes, sampleEntry.start + 34);
      if (!width || !height) return null;
      video = { width, height };
    }
  }
  return video ? { video, durationSeconds } : null;
}

function actualMimeType(bytes: Buffer) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6))) return "image/gif";
  if (bytes.length >= 12 && bytes.toString("ascii", 4, 8) === "ftyp") return "video/mp4";
  return null;
}

export function validateMediaCheckFile(bytes: Buffer, declaredMimeType: unknown):
  | { error: MediaCheckValidationError }
  | { media: ValidatedMedia } {
  if (!bytes.length) return { error: "empty" };
  const mimeType = typeof declaredMimeType === "string" ? declaredMimeType.split(";")[0].trim().toLowerCase() : "";
  if (!MEDIA_CHECK_ANALYSIS_IMAGE_TYPES.includes(mimeType as typeof MEDIA_CHECK_ANALYSIS_IMAGE_TYPES[number])
    && !MEDIA_CHECK_VIDEO_TYPES.includes(mimeType as typeof MEDIA_CHECK_VIDEO_TYPES[number])) {
    return { error: "unsupported_type" };
  }
  if (actualMimeType(bytes) !== mimeType) return { error: "type_mismatch" };

  if (MEDIA_CHECK_ANALYSIS_IMAGE_TYPES.includes(mimeType as typeof MEDIA_CHECK_ANALYSIS_IMAGE_TYPES[number])) {
    if (bytes.length > MEDIA_CHECK_MAX_IMAGE_BYTES) return { error: "too_large" };
    const dimensions = imageDimensions(bytes, mimeType);
    const width = dimensions?.width;
    const height = dimensions?.height;
    if (typeof width !== "number" || !width || typeof height !== "number" || !height) return { error: "invalid_media" };
    if (width > MEDIA_CHECK_MAX_IMAGE_EDGE
      || height > MEDIA_CHECK_MAX_IMAGE_EDGE
      || width * height > MEDIA_CHECK_MAX_IMAGE_PIXELS) {
      return { error: "dimensions_exceeded" };
    }
    return { media: { mimeType: mimeType as ValidatedMedia["mimeType"], mediaType: "image", width, height } };
  }

  if (bytes.length > MEDIA_CHECK_MAX_VIDEO_BYTES) return { error: "too_large" };
  const parsed = parseMp4(bytes);
  if (!parsed) return { error: "invalid_media" };
  if (parsed.durationSeconds >= MEDIA_CHECK_MAX_VIDEO_SECONDS) return { error: "duration_exceeded" };
  if (!isMediaCheckVideoDimensionsSupported(parsed.video.width, parsed.video.height)) {
    return { error: "dimensions_exceeded" };
  }
  return {
    media: {
      mimeType: "video/mp4",
      mediaType: "video",
      durationSeconds: parsed.durationSeconds,
      ...parsed.video,
    },
  };
}
