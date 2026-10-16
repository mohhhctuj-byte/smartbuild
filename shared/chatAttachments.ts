export type ChatAttachment = { key: string; name: string; mimeType: string };

export const MAX_CHAT_ATTACHMENTS = 12;

const ATTACHMENT_MARKER = "\n\u2063smartbuild-attachments-v1:";

export function encodeMessageAttachments(content: string, attachments: ChatAttachment[]) {
  if (!attachments.length) return content;
  return `${content}${ATTACHMENT_MARKER}${encodeURIComponent(JSON.stringify(attachments))}\u2063`;
}

export function decodeMessageAttachments(content: string): { content: string; attachments: ChatAttachment[] } {
  const markerIndex = content.lastIndexOf(ATTACHMENT_MARKER);
  if (markerIndex < 0 || !content.endsWith("\u2063")) return { content, attachments: [] };
  try {
    const metadata = decodeURIComponent(content.slice(markerIndex + ATTACHMENT_MARKER.length, -1));
    const attachments = JSON.parse(metadata) as unknown;
    if (!Array.isArray(attachments) || !attachments.every(attachment =>
      attachment
      && typeof attachment.key === "string"
      && typeof attachment.name === "string"
      && typeof attachment.mimeType === "string",
    )) return { content, attachments: [] };
    return { content: content.slice(0, markerIndex), attachments };
  } catch {
    return { content, attachments: [] };
  }
}
