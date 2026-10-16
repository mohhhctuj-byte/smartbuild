export type AssistantTextSelection = {
  text: string;
  top: number;
  left: number;
};

export function getAssistantTextSelection(
  selection: Selection | null,
  viewport: { width: number; height: number },
  assistantMessages: Element[] = Array.from(document.querySelectorAll(".smartbuild-assistant-message")),
): AssistantTextSelection | null {
  const text = selection?.toString().trim();
  if (!selection || selection.isCollapsed || !text || selection.rangeCount === 0) return null;

  const anchorNode = selection.anchorNode;
  const focusNode = selection.focusNode;
  if (!anchorNode || !focusNode) return null;
  const assistantMessage = assistantMessages.find(message =>
    message.contains(anchorNode) && message.contains(focusNode),
  );
  if (!assistantMessage) return null;

  const bounds = selection.getRangeAt(0).getBoundingClientRect();
  if (!bounds.width && !bounds.height) return null;
  const popupWidth = 54;
  const fitsBesideWord = bounds.right + popupWidth + 8 <= viewport.width;
  const left = fitsBesideWord
    ? bounds.right + 6
    : Math.max(8, bounds.left - popupWidth - 6);
  const top = Math.max(8, Math.min(bounds.top + (bounds.height - 24) / 2, viewport.height - 32));
  return { text, top: Math.max(8, top), left };
}
