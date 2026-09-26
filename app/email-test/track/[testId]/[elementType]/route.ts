import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { isElementSlug } from "@/lib/email-test/tokens";
import { buildTrackingResponse } from "@/lib/email-test/responses";
import { getTrackingTestForTracking, recordTrackingEvent } from "@/lib/email-test/store";

// Headers worth keeping for diagnosing client/proxy behavior. Deliberately
// not "all headers" — this is a diagnostic tool, not a general log dump.
const CAPTURED_HEADERS = [
  "accept",
  "accept-language",
  "accept-encoding",
  "via",
  "x-forwarded-for",
  "cache-control",
  "if-none-match",
  "if-modified-since",
  "dnt",
  "sec-fetch-site",
  "sec-fetch-mode",
  "sec-fetch-dest",
];

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function getClientIp(request: NextRequest): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip");
}

export async function GET(
  request: NextRequest,
  { params }: { params: { testId: string; elementType: string } }
) {
  const { testId, elementType } = params;
  console.log(`email-test tracking hit: test=${testId} element=${elementType}`);

  // Unknown element type — nothing meaningful to serve or record.
  if (!isElementSlug(elementType)) {
    return new NextResponse(null, { status: 404, headers: NO_CACHE_HEADERS });
  }

  const { contentType, body } = buildTrackingResponse(elementType);
  const token = request.nextUrl.searchParams.get("t");

  const admin = createAdminClient();
  const test = await getTrackingTestForTracking(admin, testId).catch((err) => {
    console.error("email-test tracking lookup failed:", err);
    return null;
  });

  // Serve the correct resource type either way so a genuine client never
  // sees broken markup — but only log requests that carry a matching,
  // unforgeable token for this exact test + element.
  const isValid = !!test && !!token && test.element_tokens[elementType] === token;

  if (isValid && test) {
    const headers: Record<string, string> = {};
    for (const name of CAPTURED_HEADERS) {
      const value = request.headers.get(name);
      if (value) headers[name] = value;
    }
    const query: Record<string, string> = {};
    request.nextUrl.searchParams.forEach((value, key) => {
      query[key] = value;
    });

    await recordTrackingEvent(admin, {
      testId: test.id,
      elementType,
      method: request.method,
      userAgent: request.headers.get("user-agent"),
      ip: getClientIp(request),
      headers,
      query,
      referer: request.headers.get("referer"),
      statusCode: 200,
    });
  }

  return new NextResponse(body as BodyInit, {
    status: 200,
    headers: { "Content-Type": contentType, ...NO_CACHE_HEADERS },
  });
}
