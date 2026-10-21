// Free-tier AI drafting: Groq first, Google Gemini as the fallback.
// Server-side only: the API keys must never reach the browser.
//
// Providers retire models often, so model names are NOT hardcoded. Each
// provider is asked which models it currently offers and a suitable one is
// picked automatically. GROQ_MODEL / GEMINI_MODEL are optional overrides, and
// an override that turns out to be retired (404) is ignored in favour of
// auto-detection.

export const MAX_DRAFTS_PER_REQUEST = 8;

// Last-resort names, used only if the provider's model list cannot be fetched.
const FALLBACK_GROQ_MODEL = "openai/gpt-oss-120b";
const FALLBACK_GEMINI_MODEL = "gemini-3.5-flash-lite";

export function isAiConfigured() {
  return Boolean(process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY);
}

// ---- model discovery -------------------------------------------------------

/** Chooses a chat model from the ids Groq reports as available. */
export function pickGroqModel(ids: string[]): string {
  const preferred = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
  for (const id of preferred) if (ids.includes(id)) return id;

  const chat = ids.filter((id) => !/(whisper|tts|orpheus|guard|safeguard|compound|embed|allam)/i.test(id));
  if (chat.length === 0) throw new Error("Groq lists no chat models for this key");
  return chat[0];
}

/** Chooses the newest Flash / Flash-Lite model that supports generateContent. */
export function pickGeminiModel(models: { name: string; supportedGenerationMethods?: string[] }[]): string {
  const ids = models
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    .filter((id) => /^gemini-/.test(id) && /flash/.test(id) && !/(tts|image|live|embed|audio|native|robotics|computer|vision|imagen|veo|aqa|learnlm|gemma)/i.test(id));

  // Rolling aliases never go stale, so prefer them when they exist.
  if (ids.includes("gemini-flash-lite-latest")) return "gemini-flash-lite-latest";

  const version = (id: string) => parseFloat(/^gemini-(\d+(?:\.\d+)?)/.exec(id)?.[1] ?? "0");
  const ranked = ids
    .filter((id) => version(id) > 0)
    .sort(
      (a, b) =>
        version(b) - version(a) ||
        Number(/lite/.test(b)) - Number(/lite/.test(a)) ||
        Number(/(preview|exp)/.test(a)) - Number(/(preview|exp)/.test(b))
    );
  if (ranked[0]) return ranked[0];
  if (ids.includes("gemini-flash-latest")) return "gemini-flash-latest";
  throw new Error("Gemini lists no usable Flash model for this key");
}

const MODEL_TTL_MS = 6 * 60 * 60 * 1000;
const modelCache = new Map<string, { id: string; at: number }>();

async function discoverGroqModel(): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Groq model list ${res.status}`);
  const data = await res.json();
  return pickGroqModel((data?.data ?? []).map((m: { id: string }) => m.id));
}

async function discoverGeminiModel(): Promise<string> {
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
    headers: { "x-goog-api-key": process.env.GEMINI_API_KEY! },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Gemini model list ${res.status}`);
  const data = await res.json();
  return pickGeminiModel(data?.models ?? []);
}

async function getModel(provider: "groq" | "gemini", forceDiscover = false): Promise<string> {
  const override = provider === "groq" ? process.env.GROQ_MODEL : process.env.GEMINI_MODEL;
  if (override && !forceDiscover) return override;

  const hit = modelCache.get(provider);
  if (hit && !forceDiscover && Date.now() - hit.at < MODEL_TTL_MS) return hit.id;

  try {
    const id = provider === "groq" ? await discoverGroqModel() : await discoverGeminiModel();
    modelCache.set(provider, { id, at: Date.now() });
    return id;
  } catch (err) {
    console.error(`ai: could not list ${provider} models, using fallback`, err);
    return provider === "groq" ? FALLBACK_GROQ_MODEL : FALLBACK_GEMINI_MODEL;
  }
}

// ---- prompts ---------------------------------------------------------------

const SYSTEM_PROMPT = `You are an email-writing assistant. The person using you will send what you write from their own mailbox.

Rules:
- Write only the email body. No subject line and no "Subject:" text.
- Plain text only: short paragraphs separated by a blank line. No markdown, no HTML, no bullet symbols unless the instructions ask for a list.
- Do not invent facts, names, dates, prices, links or attachments that the instructions do not mention.
- Never use placeholders such as [Name], {{name}} or <name>. If a greeting is needed, use a neutral one (for example "Hello,").
- End with a short closing line, but do not sign with a made-up name.
- Reply in the same language the instructions are written in, unless they ask for another language.
- Respond with JSON only, in exactly this shape: {"drafts": ["...", "..."]}`;

function userMessage(prompt: string, count: number) {
  const ask =
    count === 1
      ? "Write exactly 1 email body."
      : `Write exactly ${count} different email bodies. Each one must keep the same purpose and facts, but use different wording, structure and opening so that no two read alike.`;
  return `Instructions from the sender:\n"""\n${prompt}\n"""\n\n${ask}`;
}

// Models that "think" spend part of the token budget on reasoning, so leave headroom.
const tokenBudget = (count: number) => 1500 + 1200 * count;

// ---- providers -------------------------------------------------------------

function groqRequest(model: string, prompt: string, count: number) {
  return fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model,
      temperature: 0.8,
      max_completion_tokens: tokenBudget(count),
      response_format: { type: "json_object" },
      // gpt-oss models reason before answering; keep it short for plain emails.
      ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage(prompt, count) },
      ],
    }),
    signal: AbortSignal.timeout(40_000),
    cache: "no-store",
  });
}

async function callGroq(prompt: string, count: number): Promise<string> {
  let res = await groqRequest(await getModel("groq"), prompt, count);
  if (res.status === 404) res = await groqRequest(await getModel("groq", true), prompt, count); // model retired
  if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

function geminiRequest(model: string, prompt: string, count: number) {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: userMessage(prompt, count) }] }],
      generationConfig: { temperature: 0.8, maxOutputTokens: tokenBudget(count), responseMimeType: "application/json" },
    }),
    signal: AbortSignal.timeout(40_000),
    cache: "no-store",
  });
}

async function callGemini(prompt: string, count: number): Promise<string> {
  let res = await geminiRequest(await getModel("gemini"), prompt, count);
  if (res.status === 404) res = await geminiRequest(await getModel("gemini", true), prompt, count); // model retired
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
}

/** Finds the JSON in a model reply, even when it is wrapped in code fences or chatter. */
function extractJson(raw: string): unknown {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.search(/[{\[]/);
    const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    if (start === -1 || end <= start) throw new Error("Reply contained no JSON");
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

/** Returns whatever valid drafts a reply contains (possibly fewer than asked for, never an error for that). */
export function parseAnyDrafts(raw: string): string[] {
  const parsed = extractJson(raw) as { drafts?: unknown } | unknown[];
  const list: unknown = Array.isArray(parsed) ? parsed : parsed?.drafts;
  if (!Array.isArray(list)) throw new Error("Reply had no drafts array");

  return list
    .filter((d): d is string => typeof d === "string")
    .map((d) => d.trim().slice(0, 6000))
    .filter(Boolean);
}

/**
 * Writes `count` drafts. For each provider (Groq, then Gemini) it asks for
 * everything in one request and keeps whatever valid drafts come back, then
 * tops up any that are missing one at a time (single drafts are the most
 * reliable). Drafts already collected carry over if it has to switch provider.
 * Throws only if every configured provider fails.
 */
export async function generateDrafts(prompt: string, count: number): Promise<string[]> {
  const providers: [string, (n: number) => Promise<string>][] = [];
  if (process.env.GROQ_API_KEY) providers.push(["groq", (n) => callGroq(prompt, n)]);
  if (process.env.GEMINI_API_KEY) providers.push(["gemini", (n) => callGemini(prompt, n)]);
  if (providers.length === 0) throw new Error("No AI provider configured");

  const drafts: string[] = [];
  let lastError: unknown;

  for (const [name, call] of providers) {
    try {
      // 1) one request for everything still missing; a bad reply is not fatal
      try {
        const missing = count - drafts.length;
        drafts.push(...parseAnyDrafts(await call(missing)).slice(0, missing));
      } catch (err) {
        console.error(`ai: ${name} batch reply unusable`, err);
        lastError = err;
      }

      // 2) top up the rest one at a time (also acts as a retry when count is 1)
      let attempts = 0;
      while (drafts.length < count && attempts++ < count + 1) {
        const [draft] = parseAnyDrafts(await call(1));
        if (draft) drafts.push(draft);
      }

      if (drafts.length >= count) return drafts.slice(0, count);
    } catch (err) {
      console.error(`ai: ${name} failed`, err);
      lastError = err;
    }
  }
  throw lastError ?? new Error("AI returned too few drafts");
}
