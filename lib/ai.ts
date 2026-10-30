// Free-tier AI drafting. The shared providers are tried in this order:
//   1. Groq     - several models in turn (every model has its own free quota)
//   2. Gemini   - Google AI Studio free tier
//   3. Mistral  - optional, free "Experiment" plan (set MISTRAL_API_KEY)
// A user who saved their own Groq key skips the shared providers completely:
// their emails are written with their key only (see lib/ai-keys.ts).
// Server-side only: API keys must never reach the browser.
//
// Providers retire models often, so model names are NOT hardcoded. Each
// provider is asked which models it currently offers and suitable ones are
// picked automatically. GROQ_MODEL / GEMINI_MODEL / MISTRAL_MODEL are optional
// overrides; an override that is retired or unknown is ignored.

export const MAX_DRAFTS_PER_REQUEST = 8;

// Last-resort names, used only if the provider's model list cannot be fetched.
const FALLBACK_GROQ_MODEL = "openai/gpt-oss-120b";
const FALLBACK_GEMINI_MODEL = "gemini-3.5-flash-lite";
const FALLBACK_MISTRAL_MODEL = "mistral-small-latest";

/** How many different Groq models may be tried one after the other. */
const MAX_GROQ_MODELS = 4;

const GROQ_BASE = "https://api.groq.com/openai/v1";
const MISTRAL_BASE = "https://api.mistral.ai/v1";

export type AiOptions = {
  /** The user's own Groq API key. When set, ONLY this key is used for the request. */
  groqKey?: string | null;
};

/** An HTTP error from an AI provider (rate limit, bad key, retired model ...). */
export class AiHttpError extends Error {
  constructor(public provider: string, public status: number, message: string, public retryAfterMs?: number) {
    super(message);
  }
}

export function isAiConfigured() {
  return Boolean(process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY || process.env.MISTRAL_API_KEY);
}

function retryAfterOf(res: Response): number | undefined {
  const seconds = parseFloat(res.headers.get("retry-after") ?? "");
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : undefined;
}

async function httpError(provider: string, res: Response) {
  const text = (await res.text().catch(() => "")).slice(0, 300);
  return new AiHttpError(provider, res.status, `${provider} ${res.status}: ${text}`, retryAfterOf(res));
}

// ---- model discovery -------------------------------------------------------

const NOT_CHAT = /(whisper|tts|orpheus|guard|safeguard|compound|embed|allam)/i;

/**
 * Orders the chat models Groq reports, best first: gpt-oss 120b, gpt-oss 20b,
 * Qwen, Llama, then anything else that chats. Each model has its own free quota,
 * so trying them one after the other multiplies what one key can do.
 */
export function rankGroqModels(ids: string[]): string[] {
  const chat = ids.filter((id) => !NOT_CHAT.test(id));
  const override = process.env.GROQ_MODEL ? [process.env.GROQ_MODEL] : [];
  const first = [...override, "openai/gpt-oss-120b", "openai/gpt-oss-20b"].filter((id) => chat.includes(id));
  const qwen = chat.filter((id) => /^qwen\//i.test(id));
  const llama = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"].filter((id) => chat.includes(id));
  return Array.from(new Set([...first, ...qwen, ...llama, ...chat]));
}

/** Chooses the single best chat model from the ids Groq reports as available. */
export function pickGroqModel(ids: string[]): string {
  const ranked = rankGroqModels(ids);
  if (ranked.length === 0) throw new Error("Groq lists no chat models for this key");
  return ranked[0];
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

/** Chooses a general chat model from Mistral's model list. */
export function pickMistralModel(models: { id: string; capabilities?: { completion_chat?: boolean } }[]): string {
  const usable = models.filter((m) => m.capabilities?.completion_chat !== false && !/(embed|moderation|ocr|codestral|voxtral|pixtral|devstral|transcribe)/i.test(m.id));
  const ids = usable.map((m) => m.id);
  for (const id of ["mistral-small-latest", "mistral-medium-latest", "open-mistral-nemo", "ministral-8b-latest"]) if (ids.includes(id)) return id;
  if (ids[0]) return ids[0];
  throw new Error("Mistral lists no chat models for this key");
}

const MODEL_TTL_MS = 6 * 60 * 60 * 1000;
const keyTag = (key: string) => `${key.slice(-6)}:${key.length}`;

const groqModelCache = new Map<string, { ids: string[]; at: number }>();
async function listGroqModels(key: string): Promise<string[]> {
  const tag = keyTag(key);
  const hit = groqModelCache.get(tag);
  if (hit && Date.now() - hit.at < MODEL_TTL_MS) return hit.ids;

  const res = await fetch(`${GROQ_BASE}/models`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!res.ok) throw await httpError("groq", res);
  const data = await res.json();
  const ids: string[] = (data?.data ?? []).map((m: { id: string }) => m.id);
  groqModelCache.set(tag, { ids, at: Date.now() });
  return ids;
}

const otherModelCache = new Map<string, { id: string; at: number }>();

async function getGeminiModel(forceDiscover = false): Promise<string> {
  if (process.env.GEMINI_MODEL && !forceDiscover) return process.env.GEMINI_MODEL;
  const hit = otherModelCache.get("gemini");
  if (hit && !forceDiscover && Date.now() - hit.at < MODEL_TTL_MS) return hit.id;
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
      headers: { "x-goog-api-key": process.env.GEMINI_API_KEY! },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Gemini model list ${res.status}`);
    const id = pickGeminiModel((await res.json())?.models ?? []);
    otherModelCache.set("gemini", { id, at: Date.now() });
    return id;
  } catch (err) {
    console.error("ai: could not list gemini models, using fallback", err);
    return FALLBACK_GEMINI_MODEL;
  }
}

async function getMistralModel(forceDiscover = false): Promise<string> {
  if (process.env.MISTRAL_MODEL && !forceDiscover) return process.env.MISTRAL_MODEL;
  const hit = otherModelCache.get("mistral");
  if (hit && !forceDiscover && Date.now() - hit.at < MODEL_TTL_MS) return hit.id;
  try {
    const res = await fetch(`${MISTRAL_BASE}/models`, {
      headers: { Authorization: `Bearer ${process.env.MISTRAL_API_KEY}` },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Mistral model list ${res.status}`);
    const id = pickMistralModel((await res.json())?.data ?? []);
    otherModelCache.set("mistral", { id, at: Date.now() });
    return id;
  } catch (err) {
    console.error("ai: could not list mistral models, using fallback", err);
    return FALLBACK_MISTRAL_MODEL;
  }
}

// ---- prompts ---------------------------------------------------------------

const SYSTEM_PROMPT = `You are an email-writing assistant. The person using you will send what you write from their own mailbox.

For every email write a subject line and a body.

Subject rules:
- Short and specific (under 70 characters), no ALL CAPS, no clickbait, no emoji.
- If a website is given for that email, the subject must mention that website exactly as written.

Body rules:
- Plain text only: short paragraphs separated by a blank line. No markdown, no HTML, no bullet symbols unless the instructions ask for a list.
- Do not invent facts, names, dates, prices, links or attachments that the instructions do not mention.
- Never use placeholders such as [Name], {{name}} or <name>. If a greeting is needed, use a neutral one (for example "Hello,").
- End with a short closing line, but do not sign with a made-up name.

Reply in the same language the instructions are written in, unless they ask for another language.
Respond with JSON only, in exactly this shape: {"emails": [{"subject": "...", "body": "..."}]}`;

function userMessage(prompt: string, contexts: (string | null)[]) {
  const count = contexts.length;
  const ask =
    count === 1
      ? "Write exactly 1 email."
      : `Write exactly ${count} different emails. Each one must keep the same purpose and facts, but use different wording, structure and opening so that no two read alike.`;
  const websites = contexts.some(Boolean)
    ? `\n\nThe emails are for these websites, in order. Mention each email's website in its subject:\n${contexts
        .map((w, i) => `${i + 1}. ${w ?? "(no website)"}`)
        .join("\n")}`
    : "";
  return `Instructions from the sender:\n"""\n${prompt}\n"""\n\n${ask}${websites}`;
}

// ---- providers -------------------------------------------------------------

/** One thing we can ask: a provider + model (+ key). Slots are tried in order. */
type Slot = {
  id: string;
  label: string;
  /** max output tokens for a request that asks for `count` emails */
  budget: (count: number) => number;
  call: (user: string, tokens: number) => Promise<string>;
};

// Groq and Mistral count tokens per minute on small free plans, so keep each request modest.
// Models that "think" spend part of the budget on reasoning, so leave headroom.
const compactBudget = (count: number) => 1000 + 520 * count;
const generousBudget = (count: number) => 1500 + 1400 * count;

function groqSlot(key: string, model: string): Slot {
  return {
    id: `groq:${keyTag(key)}:${model}`,
    label: `groq ${model}`,
    budget: compactBudget,
    call: async (user, tokens) => {
      const res = await fetch(`${GROQ_BASE}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          temperature: 0.8,
          max_completion_tokens: tokens,
          response_format: { type: "json_object" },
          // gpt-oss models reason before answering; keep it short for plain emails.
          ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: user },
          ],
        }),
        signal: AbortSignal.timeout(40_000),
        cache: "no-store",
      });
      if (!res.ok) throw await httpError("groq", res);
      const data = await res.json();
      return data?.choices?.[0]?.message?.content ?? "";
    },
  };
}

function geminiSlot(): Slot {
  const request = (model: string, user: string, tokens: number) =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: tokens, responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(40_000),
      cache: "no-store",
    });
  return {
    id: "gemini",
    label: "gemini",
    budget: generousBudget,
    call: async (user, tokens) => {
      let res = await request(await getGeminiModel(), user, tokens);
      if (res.status === 404) res = await request(await getGeminiModel(true), user, tokens); // model retired
      if (!res.ok) throw await httpError("gemini", res);
      const data = await res.json();
      return data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
    },
  };
}

function mistralSlot(): Slot {
  const request = (model: string, user: string, tokens: number) =>
    fetch(`${MISTRAL_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.MISTRAL_API_KEY}` },
      body: JSON.stringify({
        model,
        temperature: 0.8,
        max_tokens: tokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(40_000),
      cache: "no-store",
    });
  return {
    id: "mistral",
    label: "mistral",
    budget: compactBudget,
    call: async (user, tokens) => {
      let res = await request(await getMistralModel(), user, tokens);
      if (res.status === 404) res = await request(await getMistralModel(true), user, tokens); // model retired
      if (!res.ok) throw await httpError("mistral", res);
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      return typeof content === "string" ? content : Array.isArray(content) ? content.map((c: { text?: string }) => c.text ?? "").join("") : "";
    },
  };
}

/** One slot per Groq model this key can use (best model first). */
async function groqSlotsFor(key: string, strict: boolean): Promise<Slot[]> {
  let ids: string[];
  try {
    ids = await listGroqModels(key);
  } catch (err) {
    // A user's own key that Groq rejects must be reported, not hidden behind another provider.
    if (strict && err instanceof AiHttpError && (err.status === 401 || err.status === 403)) throw err;
    console.error("ai: could not list groq models, using fallback", err);
    ids = [FALLBACK_GROQ_MODEL];
  }
  const models = rankGroqModels(ids).slice(0, MAX_GROQ_MODELS);
  return (models.length > 0 ? models : [FALLBACK_GROQ_MODEL]).map((m) => groqSlot(key, m));
}

async function buildSlots(opts: AiOptions): Promise<Slot[]> {
  if (opts.groqKey) return groqSlotsFor(opts.groqKey, true); // the user's own key only

  const slots: Slot[] = [];
  if (process.env.GROQ_API_KEY) slots.push(...(await groqSlotsFor(process.env.GROQ_API_KEY, false)));
  if (process.env.GEMINI_API_KEY) slots.push(geminiSlot());
  if (process.env.MISTRAL_API_KEY) slots.push(mistralSlot());
  return slots;
}

// ---- cool-downs ------------------------------------------------------------
// After a rate-limit (or other) error a slot is skipped for a while, so the next
// emails go straight to a model that can answer instead of failing first.
// Kept in memory: it resets when the server restarts, which is harmless.

const cooldowns = new Map<string, number>();

function cooldownMsFor(err: unknown): number {
  if (err instanceof AiHttpError) {
    const text = err.message;
    if (err.status === 429) {
      if (/per day|\(TPD\)|\(RPD\)|daily/i.test(text)) return 30 * 60_000;
      return Math.min(Math.max(err.retryAfterMs ?? 0, 30_000), 5 * 60_000);
    }
    if (err.status === 413) return 60_000;
    if (err.status === 401 || err.status === 403) return 10 * 60_000;
    if (err.status === 404 || /decommission|does not exist|not found/i.test(text)) return 6 * 60 * 60_000;
    if (err.status === 400) return 2 * 60_000;
    return 60_000; // 5xx
  }
  if (err instanceof Error && /timeout|aborted/i.test(`${err.name} ${err.message}`)) return 30_000;
  return 0;
}

function coolDown(slot: Slot, err: unknown) {
  const ms = cooldownMsFor(err);
  if (ms > 0) cooldowns.set(slot.id, Date.now() + ms);
}

const isCoolingDown = (slot: Slot) => (cooldowns.get(slot.id) ?? 0) > Date.now();

/** A message for the person using the app. */
export function aiErrorMessage(err: unknown, usedOwnKey: boolean): string {
  if (usedOwnKey && err instanceof AiHttpError) {
    if (err.status === 401 || err.status === 403) return "Groq did not accept your API key. Update it in Settings, or remove it to use the free shared AI.";
    if (err.status === 429 || err.status === 413) return "Your Groq key has reached its own limit for now. Please try again in a few minutes.";
  }
  return usedOwnKey
    ? "The AI did not answer with your Groq key. Please try again in a minute."
    : "The AI is busy right now. Please try again in a minute.";
}

/** Finds the JSON in a model reply, even when it is wrapped in code fences or chatter. */
function extractJson(raw: string): unknown {
  // Some models print their reasoning in <think> tags before the answer.
  const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.search(/[{\[]/);
    const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    if (start === -1 || end <= start) throw new Error("Reply contained no JSON");
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

export type GeneratedEmail = { subject: string; body: string };

/** Returns whatever valid emails a reply contains (possibly fewer than asked for). */
export function parseAnyEmails(raw: string): GeneratedEmail[] {
  const parsed = extractJson(raw) as { emails?: unknown; drafts?: unknown } | unknown[];
  const list: unknown = Array.isArray(parsed) ? parsed : parsed?.emails ?? parsed?.drafts;
  if (!Array.isArray(list)) throw new Error("Reply had no emails array");

  const out: GeneratedEmail[] = [];
  for (const item of list) {
    const e = item as { subject?: unknown; body?: unknown };
    if (typeof e?.subject !== "string" || typeof e?.body !== "string") continue;
    const subject = e.subject.replace(/\s+/g, " ").trim().slice(0, 150);
    const body = e.body.trim().slice(0, 6000);
    if (subject && body) out.push({ subject, body });
  }
  return out;
}

/** Guarantees the website appears in the subject, whatever the model did. */
export function ensureWebsiteInSubject(subject: string, website: string | null): string {
  if (!website) return subject;
  const lower = subject.toLowerCase();
  const label = website.split(".")[0];
  if (lower.includes(website.toLowerCase()) || (label.length >= 3 && lower.includes(label.toLowerCase()))) return subject;
  return `${subject} - ${website}`.slice(0, 160);
}

/**
 * Writes one email per entry of `contexts` (a website, or null). For each slot
 * (Groq models, then Gemini, then Mistral - or only the user's own Groq key)
 * it asks for everything in one request and keeps whatever valid emails come
 * back, then tops up the missing ones one at a time. Emails already collected
 * carry over if it has to switch to the next slot. A slot that is rate limited
 * is skipped straight away and left alone for a while.
 */
export async function generateEmails(prompt: string, contexts: (string | null)[], opts: AiOptions = {}): Promise<GeneratedEmail[]> {
  const count = contexts.length;
  const slots = await buildSlots(opts);
  if (slots.length === 0) throw new Error("No AI provider configured");

  const emails: GeneratedEmail[] = [];
  let lastError: unknown;

  for (const slot of slots) {
    if (isCoolingDown(slot)) continue;
    try {
      // 1) one request for everything still missing; a bad reply is not fatal
      try {
        const remaining = contexts.slice(emails.length);
        const got = parseAnyEmails(await slot.call(userMessage(prompt, remaining), slot.budget(remaining.length)));
        emails.push(...got.slice(0, remaining.length));
      } catch (err) {
        if (err instanceof AiHttpError) throw err; // rate limit / bad key: do not hammer the same slot
        console.error(`ai: ${slot.label} batch reply unusable`, err);
        lastError = err;
      }

      // 2) top up the rest one at a time (also acts as a retry when count is 1)
      let attempts = 0;
      while (emails.length < count && attempts++ < count + 1) {
        const [email] = parseAnyEmails(await slot.call(userMessage(prompt, [contexts[emails.length]]), slot.budget(1)));
        if (email) emails.push(email);
      }

      if (emails.length >= count) {
        return emails.slice(0, count).map((e, i) => ({ ...e, subject: ensureWebsiteInSubject(e.subject, contexts[i]) }));
      }
    } catch (err) {
      console.error(`ai: ${slot.label} failed:`, err instanceof Error ? err.message : err);
      coolDown(slot, err);
      lastError = err;
    }
  }
  throw lastError ?? new Error("AI is busy: every model is cooling down after a rate limit");
}
