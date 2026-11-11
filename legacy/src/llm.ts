import { config } from "./config.js";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmResult {
  ok: boolean;
  text: string;
  error?: string;
}

export async function callLlm(messages: ChatMessage[], opts: { json?: boolean; maxTokens?: number } = {}): Promise<LlmResult> {
  if (!config.llm.enabled) {
    return { ok: false, text: "", error: "LLM not configured (set LLM_BASE_URL, LLM_API_KEY, LLM_MODEL)" };
  }
  const url = config.llm.baseUrl.replace(/\/$/, "") + "/chat/completions";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.llm.apiKey ? { Authorization: `Bearer ${config.llm.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.llm.model,
        messages,
        temperature: 0.2,
        max_tokens: opts.maxTokens ?? 900,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!res.ok) {
      return { ok: false, text: "", error: `LLM HTTP ${res.status}: ${(await res.text()).slice(0, 300)}` };
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return { ok: true, text: data.choices?.[0]?.message?.content ?? "" };
  } catch (err) {
    return { ok: false, text: "", error: `LLM error: ${(err as Error).message}` };
  }
}

export function extractJson<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
