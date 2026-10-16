import { describe, expect, it } from "vitest";
import { validateMediaCheckFile } from "./mediaCheckValidation";

function box(type: string, content: Buffer) {
  const result = Buffer.alloc(8 + content.length);
  result.writeUInt32BE(result.length, 0);
  result.write(type, 4, "ascii");
  content.copy(result, 8);
  return result;
}

function png(width = 1, height = 1) {
  const bytes = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function mp4(durationSeconds = 12, width = 1280, height = 720, codec = "avc1") {
  const ftyp = box("ftyp", Buffer.from("isom\0\0\0\0"));
  const mvhdData = Buffer.alloc(20);
  mvhdData.writeUInt32BE(1000, 12);
  mvhdData.writeUInt32BE(durationSeconds * 1000, 16);
  const mvhd = box("mvhd", mvhdData);
  const hdlrData = Buffer.alloc(20);
  hdlrData.write("vide", 8, "ascii");
  const hdlr = box("hdlr", hdlrData);
  const avcCData = Buffer.from([1, 0x64, 0, 0x1f, 0xff, 0xe1, 0, 2, 0x67, 0x64, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const avcC = box("avcC", avcCData);
  const visualHeader = Buffer.alloc(78);
  visualHeader.writeUInt16BE(width, 24);
  visualHeader.writeUInt16BE(height, 26);
  const sampleEntry = box(codec, Buffer.concat([visualHeader, ...(codec === "avc1" ? [avcC] : [])]));
  const stsdData = Buffer.alloc(8);
  stsdData.writeUInt32BE(1, 4);
  const stsd = box("stsd", Buffer.concat([stsdData, sampleEntry]));
  const stbl = box("stbl", stsd);
  const minf = box("minf", stbl);
  const mdia = box("mdia", Buffer.concat([hdlr, minf]));
  const trak = box("trak", mdia);
  const moov = box("moov", Buffer.concat([mvhd, trak]));
  return Buffer.concat([ftyp, moov]);
}

describe("server-side media check validation", () => {
  it("checks image bytes and server-enforced byte limits", () => {
    expect(validateMediaCheckFile(png(), "image/png")).toMatchObject({
      media: { mediaType: "image", mimeType: "image/png", width: 1, height: 1 },
    });
    expect(validateMediaCheckFile(png(), "image/jpeg")).toEqual({ error: "type_mismatch" });
    expect(validateMediaCheckFile(Buffer.from("not image"), "image/png")).toEqual({ error: "type_mismatch" });
    expect(validateMediaCheckFile(Buffer.alloc(5 * 1024 * 1024 + 1), "image/png")).toEqual({ error: "type_mismatch" });
    const oversizedPng = Buffer.alloc(5 * 1024 * 1024 + 1);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(oversizedPng);
    oversizedPng.write("IHDR", 12, "ascii");
    oversizedPng.writeUInt32BE(1, 16);
    oversizedPng.writeUInt32BE(1, 20);
    expect(validateMediaCheckFile(oversizedPng, "image/png")).toEqual({ error: "too_large" });
  });

  it("rejects GIF analysis while retaining GIF as a client-side preview-only format", () => {
    expect(validateMediaCheckFile(Buffer.from("GIF89a"), "image/gif")).toEqual({ error: "unsupported_type" });
  });

  it("validates MP4 signatures, video dimensions, and duration from the container", () => {
    expect(validateMediaCheckFile(mp4(), "video/mp4")).toMatchObject({
      media: { mediaType: "video", mimeType: "video/mp4", durationSeconds: 12, width: 1280, height: 720 },
    });
    expect(validateMediaCheckFile(mp4(12, 1080, 1920), "video/mp4")).toMatchObject({
      media: { mediaType: "video", width: 1080, height: 1920 },
    });
    expect(validateMediaCheckFile(mp4(600), "video/mp4")).toEqual({ error: "duration_exceeded" });
    expect(validateMediaCheckFile(mp4(599), "video/mp4")).toMatchObject({
      media: { mediaType: "video", durationSeconds: 599 },
    });
    expect(validateMediaCheckFile(mp4(12, 1921, 1080), "video/mp4")).toEqual({ error: "dimensions_exceeded" });
    expect(validateMediaCheckFile(mp4(12, 1920, 1080, "av01"), "video/mp4")).toMatchObject({
      media: { mediaType: "video", width: 1920, height: 1080 },
    });
    expect(validateMediaCheckFile(Buffer.from("not an mp4"), "video/mp4")).toEqual({ error: "type_mismatch" });
    expect(validateMediaCheckFile(mp4(), "video/webm")).toEqual({ error: "unsupported_type" });
  });

  it("distinguishes empty, unsupported, mismatched, and malformed media", () => {
    expect(validateMediaCheckFile(Buffer.alloc(0), "image/png")).toEqual({ error: "empty" });
    expect(validateMediaCheckFile(Buffer.from("PDF"), "application/pdf")).toEqual({ error: "unsupported_type" });
    expect(validateMediaCheckFile(png(), "image/webp")).toEqual({ error: "type_mismatch" });
    expect(validateMediaCheckFile(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), "image/png")).toEqual({ error: "invalid_media" });
  });
});
