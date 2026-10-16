import { afterEach, describe, expect, it, vi } from "vitest";
import { invokeLocalAi, isLocalAiEnabled } from "./localAi";

describe("local AI prototype", () => {
  const original = process.env.LOCAL_AI_ENABLED;

  afterEach(() => {
    if (original === undefined) delete process.env.LOCAL_AI_ENABLED;
    else process.env.LOCAL_AI_ENABLED = original;
  });

  it("is disabled unless explicitly enabled", () => {
    delete process.env.LOCAL_AI_ENABLED;
    expect(isLocalAiEnabled()).toBe(false);
    process.env.LOCAL_AI_ENABLED = "true";
    expect(isLocalAiEnabled()).toBe(true);
  });

  it("responds locally without making a network request", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const tokens: string[] = [];
    await invokeLocalAi({
      mode: "chat",
      messages: [{ role: "user", content: "اعمل خطة للمشروع" }],
    }, token => tokens.push(token));
    expect(tokens.join("")).toContain("الخطة العملية");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("returns practical responses for different life and work intents", async () => {
    const prompts = ["أنا متوتر من مقابلة عمل", "اكتب رسالة لتأجيل اجتماع", "كيف أتعامل مع عميل غاضب؟"];
    const replies: string[] = [];
    for (const prompt of prompts) {
      let reply = "";
      await invokeLocalAi({ mode: "chat", messages: [{ role: "user", content: prompt }] }, token => { reply += token; });
      replies.push(reply);
    }
    expect(new Set(replies).size).toBe(3);
    expect(replies[0]).toContain("المقابلة");
    expect(replies[1]).toContain("مرحبًا");
    expect(replies[2]).toContain("الشكوى");
  });
});
