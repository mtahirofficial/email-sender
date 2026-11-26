import { createHash } from "node:crypto";

const USER_QUOTA_PER_MINUTE = 6_000;
const QUOTA_WINDOW_MS = 60_000;
const MAX_RETRIES = 5;
const MAX_BACKOFF_MS = 32_000;

type Usage = { at: number; units: number };
const usageByMailbox = new Map<string, Usage[]>();
const cooldownByMailbox = new Map<string, number>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const mailboxKeyFor = (accessToken: string) => createHash("sha256").update(accessToken).digest("hex");

/** Gmail REST API quota-unit costs from Google's per-method quota table. */
export function gmailRequestQuotaUnits(path: string, method = "GET"): number {
  const [pathname, query = ""] = path.split("?", 2);
  const verb = method.toUpperCase();

  if (pathname === "/threads" && verb === "GET") return 10; // threads.list
  if (/^\/threads\/[^/]+\/modify$/.test(pathname) && verb === "POST") return 10; // threads.modify
  if (/^\/threads\/[^/]+$/.test(pathname) && verb === "GET") {
    return /(?:^|&)format=(?:full|raw|html)(?:&|$)/.test(query) ? 120 : 40; // threads.get
  }
  if (pathname === "/messages" && verb === "GET") return 5; // messages.list
  if (/^\/messages\/[^/]+\/attachments\/[^/]+$/.test(pathname) && verb === "GET") return 20; // attachments.get
  if (/^\/messages\/[^/]+\/modify$/.test(pathname) && verb === "POST") return 5; // messages.modify
  if (pathname === "/messages/send" && verb === "POST") return 100; // messages.send
  if (/^\/messages\/[^/]+$/.test(pathname) && verb === "GET") {
    return /(?:^|&)format=(?:full|raw|html)(?:&|$)/.test(query) ? 60 : 20; // messages.get
  }
  return 1; // Conservative fallback for other one-unit Gmail methods.
}

async function reserveQuota(accessToken: string, units: number) {
  // Hash the credential so it is never retained or logged in plain text.
  const mailboxKey = mailboxKeyFor(accessToken);
  while (true) {
    const now = Date.now();
    const cooldownUntil = cooldownByMailbox.get(mailboxKey) ?? 0;
    if (cooldownUntil > now) {
      await sleep(cooldownUntil - now + Math.floor(Math.random() * 251));
      continue;
    }
    const active = (usageByMailbox.get(mailboxKey) ?? []).filter((entry) => now - entry.at < QUOTA_WINDOW_MS);
    const used = active.reduce((total, entry) => total + entry.units, 0);

    if (used + units <= USER_QUOTA_PER_MINUTE) {
      active.push({ at: now, units });
      usageByMailbox.set(mailboxKey, active);
      return;
    }

    let remaining = used;
    let releaseAt = now + QUOTA_WINDOW_MS;
    for (const entry of active) {
      remaining -= entry.units;
      if (remaining + units <= USER_QUOTA_PER_MINUTE) {
        releaseAt = entry.at + QUOTA_WINDOW_MS;
        break;
      }
    }
    usageByMailbox.set(mailboxKey, active);
    await sleep(Math.max(50, releaseAt - now + Math.floor(Math.random() * 251)));
  }
}

function extendMailboxCooldown(accessToken: string, waitMs: number) {
  const mailboxKey = mailboxKeyFor(accessToken);
  cooldownByMailbox.set(mailboxKey, Math.max(cooldownByMailbox.get(mailboxKey) ?? 0, Date.now() + waitMs));
}

function isTimeBasedQuotaError(status: number, body: string) {
  if (status === 429 || status === 503) return true;
  return status === 403 && /rateLimitExceeded|userRateLimitExceeded|RATE_LIMIT_EXCEEDED/i.test(body);
}

function retryAfterMs(response: Response) {
  const value = response.headers.get("retry-after");
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}

/** Adds per-mailbox quota pacing and Google's truncated exponential backoff. */
export async function fetchGmailApi(
  accessToken: string,
  url: string,
  init: RequestInit,
  path: string
): Promise<Response> {
  const units = gmailRequestQuotaUnits(path, init.method ?? "GET");
  for (let attempt = 0; ; attempt++) {
    await reserveQuota(accessToken, units);

    const timeoutSignal = AbortSignal.timeout(20_000);
    const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
    const response = await fetch(url, { ...init, signal });

    if (response.ok || attempt >= MAX_RETRIES) return response;
    const body = await response.clone().text().catch(() => "");
    if (!isTimeBasedQuotaError(response.status, body)) return response;

    const backoff = Math.min((2 ** attempt) * 1000 + Math.floor(Math.random() * 1001), MAX_BACKOFF_MS);
    const waitMs = Math.max(backoff, retryAfterMs(response));
    extendMailboxCooldown(accessToken, waitMs);
    await sleep(waitMs);
  }
}
