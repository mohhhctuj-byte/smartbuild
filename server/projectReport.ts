export type ProjectReportSnapshot = {
  project: { id: number; name: string; description?: string | null; buildStatus?: "idle" | "planned" | "writing" | "previewing" | "testing" | "verifying" | "succeeded" | "failed" | "blocked" | "timed_out" | "cancelled"; createdAt?: Date | string | null; updatedAt?: Date | string | null };
  conversations: Array<{ title: string; createdAt?: Date | string | null; updatedAt?: Date | string | null }>;
  generatedFiles: Array<{ path: string; language?: string | null; createdAt?: Date | string | null }>;
  events: Array<{ eventType: string; createdAt?: Date | string | null }>;
  messageCount: number;
  sourceCount: number;
  uploadCount: number;
  generatedAt?: Date;
};

function text(value: unknown) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim();
}

function date(value: Date | string | null | undefined) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

export function safeReportFileName(name: string) {
  const safe = text(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return safe || "smartbuild-project";
}

function csvCell(value: unknown) {
  return `"${text(value).replace(/"/g, '""')}"`;
}

export function createProjectReportCsv(snapshot: ProjectReportSnapshot) {
  const generatedAt = snapshot.generatedAt ?? new Date();
  const rows: Array<Array<string | number>> = [
    ["section", "item", "value", "timestamp"],
    ["project", "name", snapshot.project.name, date(snapshot.project.createdAt)],
    ["project", "description", snapshot.project.description || "", date(snapshot.project.updatedAt)],
    ["summary", "conversations", snapshot.conversations.length, date(generatedAt)],
    ["summary", "messages", snapshot.messageCount, date(generatedAt)],
    ["summary", "generated files", snapshot.generatedFiles.length, date(generatedAt)],
    ["summary", "research sources", snapshot.sourceCount, date(generatedAt)],
    ["summary", "uploads", snapshot.uploadCount, date(generatedAt)],
    ["summary", "task graph events", snapshot.events.length, date(generatedAt)],
    ...snapshot.conversations.map(conversation => ["conversation", conversation.title, "", date(conversation.updatedAt || conversation.createdAt)]),
    ...snapshot.generatedFiles.map(file => ["generated file", file.path, file.language || "", date(file.createdAt)]),
    ...snapshot.events.map(event => ["task graph event", event.eventType, "", date(event.createdAt)]),
  ];
  return rows.map(row => row.map(csvCell).join(",")).join("\r\n");
}

function pdfText(value: unknown) {
  return text(value).replace(/[^\x20-\x7E]/g, "?").replace(/[()\\]/g, "\\$&").slice(0, 110);
}

function wrapPdfLine(value: string) {
  const chunks: string[] = [];
  let remaining = value;
  while (remaining.length > 92) {
    const breakAt = remaining.lastIndexOf(" ", 92);
    const index = breakAt > 30 ? breakAt : 92;
    chunks.push(remaining.slice(0, index));
    remaining = remaining.slice(index).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

/** Generates a deliberately plain, standards-compatible PDF summary without client-side data or executable content. */
export function createProjectReportPdf(snapshot: ProjectReportSnapshot) {
  const generatedAt = snapshot.generatedAt ?? new Date();
  const lines = [
    "SmartBuild project report",
    `Project: ${snapshot.project.name}`,
    snapshot.project.description ? `Description: ${snapshot.project.description}` : "Description: —",
    `Generated: ${date(generatedAt)}`,
    "",
    "Workspace summary",
    `Conversations: ${snapshot.conversations.length}`,
    `Messages: ${snapshot.messageCount}`,
    `Generated files: ${snapshot.generatedFiles.length}`,
    `Research sources: ${snapshot.sourceCount}`,
    `Uploads: ${snapshot.uploadCount}`,
    `Task graph events: ${snapshot.events.length}`,
    "",
    "Conversations",
    ...snapshot.conversations.slice(0, 30).map(item => `• ${item.title} (${date(item.updatedAt || item.createdAt) || "no timestamp"})`),
    "",
    "Generated files",
    ...snapshot.generatedFiles.slice(0, 60).map(item => `• ${item.path}${item.language ? ` [${item.language}]` : ""}`),
    "",
    "Task graph activity",
    ...snapshot.events.slice(-60).map(item => `• ${item.eventType} (${date(item.createdAt) || "no timestamp"})`),
  ].flatMap(line => wrapPdfLine(pdfText(line)));

  const pages = Array.from({ length: Math.max(1, Math.ceil(lines.length / 44)) }, (_, index) => lines.slice(index * 44, (index + 1) * 44));
  const objects: string[] = [];
  const pageObjectIds = pages.map((_, index) => 4 + index * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  pages.forEach((pageLines, index) => {
    const pageId = pageObjectIds[index];
    const contentId = pageId + 1;
    const content = ["BT", "/F1 11 Tf", "54 762 Td", "14 TL", ...pageLines.flatMap((line, lineIndex) => [`(${line}) Tj`, ...(lineIndex === pageLines.length - 1 ? [] : ["T*"])]), "ET"].join("\n");
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`;
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(pdf, "utf8");
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}
