import { describe, expect, it } from "vitest";
import { getAssistantTextSelection } from "./assistantTextSelection";

function makeSelection(input: {
  text: string;
  anchorNode?: object | null;
  focusNode?: object | null;
  isCollapsed?: boolean;
  rect?: Partial<DOMRect>;
}) {
  const rect = {
    top: 90,
    left: 180,
    width: 120,
    height: 18,
    right: 300,
    bottom: 108,
    ...input.rect,
  } as DOMRect;
  return {
    toString: () => input.text,
    anchorNode: input.anchorNode ?? null,
    focusNode: input.focusNode ?? null,
    isCollapsed: input.isCollapsed ?? false,
    rangeCount: 1,
    getRangeAt: () => ({ getBoundingClientRect: () => rect }),
  } as unknown as Selection;
}

function makeAssistantMessage(...nodes: object[]) {
  return {
    contains: (node: Node | null) => node !== null && nodes.includes(node),
  } as Element;
}

describe("assistant text selection", () => {
  it("returns a bounded floating-button position for selected assistant text", () => {
    const assistantText = {};
    const assistant = makeAssistantMessage(assistantText);

    expect(getAssistantTextSelection(
      makeSelection({ text: " pronunciation ", anchorNode: assistantText, focusNode: assistantText }),
      { width: 400, height: 300 },
      [assistant],
    )).toEqual({ text: "pronunciation", top: 87, left: 306 });
  });

  it("ignores selections outside assistant replies and collapsed selections", () => {
    const userText = {};
    const userMessage = makeAssistantMessage();

    expect(getAssistantTextSelection(
      makeSelection({ text: "user message", anchorNode: userText, focusNode: userText }),
      { width: 400, height: 300 },
      [userMessage],
    )).toBeNull();
    expect(getAssistantTextSelection(
      makeSelection({ text: "", anchorNode: userText, focusNode: userText, isCollapsed: true }),
      { width: 400, height: 300 },
      [userMessage],
    )).toBeNull();
  });

  it("rejects selections spanning more than one assistant reply", () => {
    const firstText = {};
    const secondText = {};
    const first = makeAssistantMessage(firstText);
    const second = makeAssistantMessage(secondText);

    expect(getAssistantTextSelection(
      makeSelection({ text: "first second", anchorNode: firstText, focusNode: secondText }),
      { width: 400, height: 300 },
      [first, second],
    )).toBeNull();
  });
});
