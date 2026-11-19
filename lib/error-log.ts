import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type AppErrorLog = {
  id: string;
  time: string;
  level: "error";
  request: { method: string; path: string; queryKeys: string[]; contentType: string | null; userAgent: string | null; userId?: string; route?: string; routeType?: string };
  response: { status: number; message: string };
  error: {
    name: string;
    message: string;
    code?: string;
    stack?: string;
    upstreamResponse?: { service: string; status: number; statusText: string; contentType: string | null; date: string | null; body: string };
  };
};

type UpstreamResponse = { status: number; statusText: string; contentType: string | null; date: string | null; body: string };

const LOG_FILE = process.env.OUTBOX_ERROR_LOG_FILE || path.join(process.cwd(), "logs", "error-logs.json");
const MAX_LOGS = 500;
const secretKeys = /token|key|secret|password|code|authorization|cookie/i;
let writeQueue: Promise<void> = Promise.resolve();

function safeRequest(request: Request, userId?: string, context?: { route?: string; routeType?: string }): AppErrorLog["request"] {
  const url = new URL(request.url);
  return {
    method: request.method,
    path: url.pathname,
    queryKeys: [...new Set([...url.searchParams.keys()].map((key) => secretKeys.test(key) ? "[redacted]" : key))],
    contentType: request.headers.get("content-type"),
    userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
    ...(userId ? { userId } : {}),
    ...(context?.route ? { route: context.route } : {}),
    ...(context?.routeType ? { routeType: context.routeType } : {}),
  };
}

export async function writeAppErrorLog(args: {
  request: Request;
  error: unknown;
  responseStatus: number;
  responseMessage: string;
  userId?: string;
  context?: { route?: string; routeType?: string };
}) {
  const error = args.error instanceof Error ? args.error : new Error(String(args.error));
  const cause = (error as Error & { cause?: unknown }).cause;
  const upstream = (args.error as { upstreamResponse?: UpstreamResponse } | null)?.upstreamResponse
    ?? (cause as { upstreamResponse?: UpstreamResponse } | null)?.upstreamResponse;
  const stack = error.stack ?? (cause instanceof Error ? cause.stack : undefined);
  const maybeCode = (args.error as { code?: unknown } | null)?.code;
  const entry: AppErrorLog = {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    time: new Date().toISOString(),
    level: "error",
    request: safeRequest(args.request, args.userId, args.context),
    response: { status: args.responseStatus, message: args.responseMessage },
    error: {
      name: error.name,
      message: `${error.message}${cause instanceof Error ? ` | cause: ${cause.message}` : ""}`.slice(0, 2000),
      ...(typeof maybeCode === "string" ? { code: maybeCode.slice(0, 100) } : cause && typeof (cause as { status?: unknown }).status === "number" ? { code: `HTTP_${(cause as { status: number }).status}` } : {}),
      ...(stack ? { stack: stack.slice(0, 6000) } : {}),
      ...(upstream ? { upstreamResponse: { service: "Gmail API", ...upstream } } : {}),
    },
  };

  const operation = writeQueue.then(async () => {
    await mkdir(path.dirname(LOG_FILE), { recursive: true });
    let entries: AppErrorLog[] = [];
    try {
      const existing = JSON.parse(await readFile(LOG_FILE, "utf8"));
      if (Array.isArray(existing)) entries = existing as AppErrorLog[];
    } catch {
      // A missing or unreadable file starts a fresh log; logging must not break the request.
    }
    entries.unshift(entry);
    await writeFile(LOG_FILE, `${JSON.stringify(entries.slice(0, MAX_LOGS), null, 2)}\n`, "utf8");
  });
  writeQueue = operation.catch((logError) => {
    console.error("Could not persist application error log", logError);
  });
  await writeQueue;
}

export async function readAppErrorLogs(): Promise<AppErrorLog[]> {
  try {
    const entries = JSON.parse(await readFile(LOG_FILE, "utf8"));
    return Array.isArray(entries) ? (entries as AppErrorLog[]).slice(0, MAX_LOGS) : [];
  } catch {
    return [];
  }
}
