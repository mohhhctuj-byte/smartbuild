import type { InvokeParams, InvokeResult } from "./_core/llm";
import { invokeWorkspaceLLMStructured } from "./llmStream";
import { AI_MODEL_IDS } from "@shared/aiModels";

type NameGenerator = (params: InvokeParams) => Promise<InvokeResult>;

export function normalizeGeneratedWorkspaceName(value: string): string {
  if (/[\r\n]/.test(value)) throw new Error("The AI returned a workspace name outside the supported format.");
  const name = value.trim().replace(/^[`"'“”‘’]+|[`"'“”‘’]+$/g, "").replace(/\s+/g, " ");
  const length = Array.from(name).length;
  const genericTitle = /^(?:new project|smartbuild workspace|workspace|project|website|web app|login|sign[- ]?in|auth|access|دخول|تسجيل دخول|شاشة دخول|شاشة تسجيل دخول|موقع|مشروع|تطبيق)$/i;
  if (!name || length > 48 || /[:;]/.test(name) || genericTitle.test(name)) {
    throw new Error("The AI returned a workspace name outside the supported format.");
  }
  return name;
}

export async function generateWorkspaceName(
  request: string,
  model: typeof AI_MODEL_IDS.claude | undefined,
  generate: NameGenerator = invokeWorkspaceLLMStructured,
): Promise<string> {
  const prompt = request.trim().slice(0, 4_000);
  if (!prompt) throw new Error("A project description is required to generate its name.");
  const result = await generate({
    model,
    timeoutMs: 8_000,
    maxTokens: 64,
    messages: [
      {
        role: "system",
        content: "Create a polished, distinctive brand-style name for the product described by the user. Return a short, memorable name in the same language as the request; 1 to 4 words, at most 48 characters. The name must express the product's identity, not merely repeat its function or category. Never return generic labels such as project, website, workspace, login, sign in, auth, access, or their direct translations. Do not copy the request, include instructions, or add an explanation.",
      },
      { role: "user", content: prompt },
    ],
    outputSchema: {
      name: "workspace_name",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: { name: { type: "string" } },
        required: ["name"],
      },
    },
  });
  const content = result.choices[0]?.message.content;
  if (typeof content !== "string") throw new Error("The AI returned no workspace name.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("The AI returned an unreadable workspace name.");
  }
  if (!parsed || typeof parsed !== "object" || !("name" in parsed) || typeof parsed.name !== "string") {
    throw new Error("The AI returned an invalid workspace name.");
  }
  return normalizeGeneratedWorkspaceName(parsed.name);
}
