import net from "node:net";
import { randomBytes } from "node:crypto";
import { resolve4, resolve6, resolveMx } from "node:dns/promises";

// Email verifier. Checks whether an address looks real WITHOUT sending any email:
//   1. syntax  2. disposable domain  3. MX lookup  4. SMTP "RCPT TO" probe (we stop before any message is sent)
//   5. catch-all test (a made-up address on the same domain)
// Server-side only (Node runtime). The SMTP probe needs OUTBOUND PORT 25 to be open; most shared hosts
// block it, in which case results come back "unknown". A VPS normally allows it.
//
// Honest limits: some providers (e.g. Outlook, Yahoo) accept every address or block unknown servers, so
// "valid" means "the mail server accepted it", not a guarantee.

export type VerifyStatus = "valid" | "invalid" | "risky" | "unknown";
export type VerifyResult = {
  email: string;
  status: VerifyStatus;
  detail: string;
  /** True when the only problem was reaching the mail servers (timeout / refused). Used to spot a blocked port 25. */
  connectionFailed?: boolean;
};

// ---- settings --------------------------------------------------------------

const hostOfAppUrl = () => {
  try {
    return new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost").hostname;
  } catch {
    return "localhost";
  }
};

// Mail servers like the name we introduce ourselves with to be a real domain that points to this server.
const HELO_HOST = (process.env.VERIFY_HELO_HOST || hostOfAppUrl()).replace(/[^A-Za-z0-9.\-]/g, "") || "localhost";
const MAIL_FROM = (process.env.VERIFY_MAIL_FROM || `verify@${HELO_HOST}`).replace(/[\s<>\r\n]/g, "");
const SMTP_PORT = Number(process.env.VERIFY_SMTP_PORT) || 25;

const TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = Number(process.env.VERIFY_RETRY_DELAY_MS) || 8_000; // wait before retrying a temporary (4xx / greylist) answer
const MAX_MX = 3; // how many mail servers to try per address
const EMAIL_DEADLINE_MS = 40_000; // hard stop per address, so one slow domain can't hold a request forever

// A small sample list. Add more domains here as you find them.
const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "temp-mail.org",
  "yopmail.com", "trashmail.com", "trashmail.net", "throwawaymail.com", "getnada.com", "sharklasers.com",
  "dispostable.com", "maildrop.cc", "fakeinbox.com", "mailnesia.com", "mintemail.com",
  "tempail.com", "moakt.com", "mohmal.com", "emailondeck.com", "mailcatch.com", "discard.email",
  "grr.la", "spam4.me", "mytemp.email", "tempr.email", "guerrillamailblock.com",
]);

const ROLE_NAMES = new Set([
  "info", "sales", "contact", "office", "admin", "support", "hello", "help", "team",
  "billing", "service", "mail", "enquiries", "inquiries", "webmaster", "postmaster", "noreply", "no-reply",
]);

const EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;

const clip = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 160);
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ---- DNS -------------------------------------------------------------------

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error("DNS timeout"), { code: "ETIMEOUT" })), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function hasAddressRecord(domain: string): Promise<boolean> {
  try {
    if ((await withTimeout(resolve4(domain), TIMEOUT_MS)).length > 0) return true;
  } catch {
    // try IPv6 next
  }
  try {
    return (await withTimeout(resolve6(domain), TIMEOUT_MS)).length > 0;
  } catch {
    return false;
  }
}

type MxLookup = { hosts: string[] } | { none: true } | { failed: string };

async function lookupMx(domain: string): Promise<MxLookup> {
  try {
    const records = await withTimeout(resolveMx(domain), TIMEOUT_MS);
    const hosts = [...records]
      .sort((a, b) => a.priority - b.priority)
      .map((r) => r.exchange.replace(/\.$/, ""))
      .filter(Boolean);
    // A single "." is a "null MX": the domain says it does not accept email.
    return hosts.length > 0 ? { hosts } : { none: true };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENODATA" || code === "ENOTFOUND") {
      // No MX record: mail then goes to the domain's own address record, if it has one.
      return (await hasAddressRecord(domain)) ? { hosts: [domain] } : { none: true };
    }
    return { failed: code ?? (err instanceof Error ? err.message : "unknown error") };
  }
}

// ---- a tiny SMTP client ----------------------------------------------------

type Reply = { code: number; text: string };

class SmtpError extends Error {
  constructor(message: string, public code?: number, public connection = false) {
    super(message);
  }
}

const CONNECTION_CODES = new Set(["ETIMEDOUT", "ECONNREFUSED", "ENETUNREACH", "EHOSTUNREACH"]);

/** Reads SMTP replies (including multi-line ones) from a socket, one at a time. */
class SmtpConn {
  private socket: net.Socket;
  private buf = "";
  private lines: string[] = [];
  private queue: Reply[] = [];
  private waiters: { resolve: (r: Reply) => void; reject: (e: Error) => void }[] = [];
  private failure: Error | null = null;

  constructor(host: string, timeoutMs: number) {
    this.socket = net.connect({ host, port: SMTP_PORT });
    this.socket.setTimeout(timeoutMs);
    this.socket.on("data", (chunk) => this.onData(chunk));
    this.socket.on("error", (err) => {
      const code = (err as NodeJS.ErrnoException).code ?? err.message;
      this.fail(new SmtpError(`connection error (${code})`, undefined, CONNECTION_CODES.has(code)));
    });
    this.socket.on("timeout", () => {
      this.fail(new SmtpError("timeout", undefined, true));
      this.socket.destroy();
    });
    this.socket.on("close", () => this.fail(new SmtpError("the server closed the connection")));
  }

  private onData(chunk: Buffer) {
    this.buf += chunk.toString("utf8");
    if (this.buf.length > 100_000) return this.fail(new SmtpError("the server sent too much data"));
    let at: number;
    while ((at = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, at).replace(/\r$/, "");
      this.buf = this.buf.slice(at + 1);
      this.lines.push(line);
      const m = /^(\d{3})([ -]?)/.exec(line);
      if (m && m[2] !== "-") {
        // last line of a reply
        const reply = { code: Number(m[1]), text: this.lines.map((l) => l.slice(4)).join(" ") };
        this.lines = [];
        const waiter = this.waiters.shift();
        if (waiter) waiter.resolve(reply);
        else this.queue.push(reply);
      }
    }
  }

  private fail(err: Error) {
    if (this.failure) return;
    this.failure = err;
    for (const waiter of this.waiters.splice(0)) waiter.reject(err);
  }

  reply(): Promise<Reply> {
    const ready = this.queue.shift();
    if (ready) return Promise.resolve(ready);
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
  }

  send(line: string) {
    if (!this.socket.destroyed) this.socket.write(`${line}\r\n`);
  }

  quit() {
    if (!this.socket.destroyed) {
      this.socket.write("QUIT\r\n");
      this.socket.end();
    }
    setTimeout(() => this.socket.destroy(), 1000).unref();
  }
}

/**
 * Asks one mail server whether it would accept `address` (RCPT TO), then hangs up without sending anything.
 * Returns the server's answer to RCPT TO. Problems before that step throw SmtpError.
 */
async function smtpRcpt(mx: string, address: string, timeoutMs: number): Promise<Reply> {
  const conn = new SmtpConn(mx, timeoutMs);
  try {
    let r = await conn.reply();
    if (r.code !== 220) throw new SmtpError(`greeting refused (${r.code}): ${clip(r.text)}`, r.code);

    conn.send(`EHLO ${HELO_HOST}`);
    r = await conn.reply();
    if (r.code !== 250) {
      conn.send(`HELO ${HELO_HOST}`);
      r = await conn.reply();
      if (r.code !== 250) throw new SmtpError(`HELO refused (${r.code}): ${clip(r.text)}`, r.code);
    }

    conn.send(`MAIL FROM:<${MAIL_FROM}>`);
    r = await conn.reply();
    if (r.code !== 250) throw new SmtpError(`sender refused (${r.code}): ${clip(r.text)}`, r.code);

    conn.send(`RCPT TO:<${address}>`);
    return await conn.reply();
  } finally {
    conn.quit();
  }
}

type ProbeOutcome =
  | { ok: true; code: number; msg: string; mx: string }
  | { ok: false; error: string; connectionOnly: boolean };

/** Tries the mail servers one by one; a temporary (4xx / greylisting) answer gets one more round. */
async function probe(mxList: string[], address: string, deadline: number): Promise<ProbeOutcome> {
  let last = "No answer from the mail servers";
  let connectionOnly = true;

  for (let attempt = 0; attempt < 2; attempt++) {
    let sawTemporary = false;
    for (const mx of mxList.slice(0, MAX_MX)) {
      const left = deadline - Date.now();
      if (left < 2000) return { ok: false, error: "Time limit reached before the server answered", connectionOnly };
      try {
        const r = await smtpRcpt(mx, address, Math.min(TIMEOUT_MS, left));
        if (r.code >= 400 && r.code < 500) {
          sawTemporary = true;
          connectionOnly = false;
          last = `The server gave a temporary answer, possibly greylisting (code ${r.code}): ${clip(r.text)}`;
          continue;
        }
        return { ok: true, code: r.code, msg: clip(r.text), mx };
      } catch (err) {
        if (err instanceof SmtpError) {
          if (err.connection) {
            last = err.message === "timeout" ? "SMTP timeout (outbound port 25 may be blocked on this server)" : `SMTP ${err.message}`;
          } else {
            connectionOnly = false;
            last = `SMTP ${err.message}`;
            if (err.code && err.code >= 400 && err.code < 500) sawTemporary = true;
          }
        } else {
          connectionOnly = false;
          last = `SMTP error: ${err instanceof Error ? err.message : String(err)}`;
        }
      }
    }
    if (attempt === 0 && sawTemporary && deadline - Date.now() > RETRY_DELAY_MS + 5000) await sleep(RETRY_DELAY_MS);
    else break;
  }
  return { ok: false, error: last, connectionOnly };
}

// ---- one address -----------------------------------------------------------

const NO_SUCH_USER = /5\.1\.[01]|user unknown|unknown user|no such user|does not exist|mailbox not found|invalid recipient|recipient not found|no mailbox/i;

export async function verifyEmail(raw: string): Promise<VerifyResult> {
  const email = raw.trim();
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    return { email, status: "invalid", detail: "The address is not written correctly" };
  }

  const at = email.lastIndexOf("@");
  const local = email.slice(0, at);
  const domain = email.slice(at + 1).toLowerCase();

  if (DISPOSABLE.has(domain)) return { email, status: "risky", detail: "Disposable (temporary) email domain" };

  const mx = await lookupMx(domain);
  if ("failed" in mx) return { email, status: "unknown", detail: `Could not look up the domain right now (${mx.failed})` };
  if ("none" in mx) return { email, status: "invalid", detail: "This domain does not receive email (no mail server)" };

  const outcome = await probe(mx.hosts, email, Date.now() + EMAIL_DEADLINE_MS);
  if (!outcome.ok) return { email, status: "unknown", detail: outcome.error, connectionFailed: outcome.connectionOnly };

  const { code, msg } = outcome;

  if (code === 250 || code === 251) {
    // Does the server accept ANY address? Then "accepted" proves nothing.
    const fake = `zz${randomBytes(7).toString("hex")}@${domain}`;
    let fakeCode: number | null = null;
    try {
      fakeCode = (await smtpRcpt(outcome.mx, fake, TIMEOUT_MS)).code;
    } catch {
      fakeCode = null;
    }
    if (fakeCode === 250 || fakeCode === 251) {
      return { email, status: "risky", detail: "Catch-all domain (the server accepts every address)" };
    }
    const note = ROLE_NAMES.has(local.toLowerCase()) ? " (role-based address such as info@ or sales@)" : "";
    return { email, status: "valid", detail: `The mailbox exists${note}` };
  }

  // A 5xx does not always mean "no such mailbox": read the server's message before deciding.
  if (code >= 500 && code < 600 && NO_SUCH_USER.test(msg)) {
    return { email, status: "invalid", detail: `The mailbox does not exist (code ${code}): ${msg}` };
  }
  if (code >= 500 && code < 600) {
    return { email, status: "unknown", detail: `The server refused or blocked the check, so the mailbox is unknown (code ${code}): ${msg}` };
  }
  return { email, status: "unknown", detail: `The server gave an unclear answer (code ${code}): ${msg}` };
}

// ---- many addresses --------------------------------------------------------
// A shared limit on simultaneous checks, across all users, so the server's IP is not hammered.

const MAX_CONCURRENT = Math.max(1, Number(process.env.VERIFY_CONCURRENCY) || 5);
let active = 0;
const waiting: (() => void)[] = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active < MAX_CONCURRENT) active++;
  else await new Promise<void>((resolve) => waiting.push(resolve)); // the slot is handed over, active stays the same
  try {
    return await fn();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}

export function verifyMany(emails: string[]): Promise<VerifyResult[]> {
  return Promise.all(
    emails.map((email) =>
      withSlot(() => verifyEmail(email)).catch(
        (err): VerifyResult => ({ email, status: "unknown", detail: `Unexpected error: ${err instanceof Error ? err.message : String(err)}` })
      )
    )
  );
}
