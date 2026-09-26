import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ELEMENT_TYPES,
  CONTROL_ELEMENT,
  generatePublicTestId,
  generateElementTokens,
  type ElementSlug,
} from "@/lib/email-test/tokens";

export type TrackingTest = {
  id: string;
  public_test_id: string;
  label: string | null;
  subject: string;
  element_tokens: Record<ElementSlug, string>;
  created_at: string;
};

/** Creates a new test (called from the signed-in dashboard, RLS-scoped client). */
export async function createTrackingTest(
  supabase: SupabaseClient,
  userId: string,
  label: string | null
): Promise<TrackingTest> {
  const publicTestId = generatePublicTestId();
  const elementTokens = generateElementTokens();
  const subject = `HTML Tracking Element Test${label ? ` — ${label}` : ""} (${publicTestId.slice(0, 6)})`;

  const { data, error } = await supabase
    .from("email_tracking_tests")
    .insert({
      user_id: userId,
      public_test_id: publicTestId,
      label,
      subject,
      element_tokens: elementTokens,
    })
    .select("id, public_test_id, label, subject, element_tokens, created_at")
    .single();

  if (error) throw error;
  return data as TrackingTest;
}

/** Lists the signed-in user's tests, most recent first (RLS-scoped client). */
export async function listTrackingTests(
  supabase: SupabaseClient,
  userId: string
): Promise<Pick<TrackingTest, "id" | "public_test_id" | "label" | "subject" | "created_at">[]> {
  const { data, error } = await supabase
    .from("email_tracking_tests")
    .select("id, public_test_id, label, subject, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

/** Looks up a test the signed-in user owns, by its public ID (RLS-scoped client). */
export async function getOwnedTrackingTest(
  supabase: SupabaseClient,
  userId: string,
  publicTestId: string
): Promise<TrackingTest | null> {
  const { data, error } = await supabase
    .from("email_tracking_tests")
    .select("id, public_test_id, label, subject, element_tokens, created_at")
    .eq("user_id", userId)
    .eq("public_test_id", publicTestId)
    .maybeSingle();

  if (error) throw error;
  return data as TrackingTest | null;
}

/**
 * Looks up a test by its public ID with no ownership check — used only by
 * the public, unauthenticated tracking endpoint (with the admin client) to
 * validate an incoming request's testId + per-element token.
 */
export async function getTrackingTestForTracking(
  supabase: SupabaseClient,
  publicTestId: string
): Promise<Pick<TrackingTest, "id" | "element_tokens"> | null> {
  const { data, error } = await supabase
    .from("email_tracking_tests")
    .select("id, element_tokens")
    .eq("public_test_id", publicTestId)
    .maybeSingle();

  if (error) throw error;
  return data as Pick<TrackingTest, "id" | "element_tokens"> | null;
}

/** Records one resource request — written with the admin client (see route handler). */
export async function recordTrackingEvent(
  supabase: SupabaseClient,
  params: {
    testId: string; // internal uuid, never the public one
    elementType: string;
    method: string;
    userAgent: string | null;
    ip: string | null;
    headers: Record<string, string>;
    query: Record<string, string>;
    referer: string | null;
    statusCode: number;
  }
) {
  const { error } = await supabase.from("email_tracking_events").insert({
    test_id: params.testId,
    element_type: params.elementType,
    method: params.method,
    user_agent: params.userAgent,
    ip: params.ip,
    headers: params.headers,
    query: params.query,
    referer: params.referer,
    status_code: params.statusCode,
  });
  if (error) console.error("Failed to record tracking event:", error);
}

export type ElementSummary = {
  slug: string;
  label: string;
  isControl: boolean;
  requestCount: number;
  firstRequestAt: string | null;
  lastRequestAt: string | null;
};

export type RawTrackingEvent = {
  id: string;
  element_type: string;
  occurred_at: string;
  method: string;
  user_agent: string | null;
  ip: string | null;
  headers: Record<string, string> | null;
  query: Record<string, string> | null;
  referer: string | null;
  status_code: number;
  /** "first" for the earliest request per element, "repeat" otherwise. */
  signal: "first" | "repeat";
};

/** Builds the per-element summary table + raw event list for the results page (RLS-scoped client). */
export async function getTrackingResults(
  supabase: SupabaseClient,
  internalTestId: string
): Promise<{ summary: ElementSummary[]; events: RawTrackingEvent[] }> {
  const { data, error } = await supabase
    .from("email_tracking_events")
    .select(
      "id, element_type, occurred_at, method, user_agent, ip, headers, query, referer, status_code"
    )
    .eq("test_id", internalTestId)
    .order("occurred_at", { ascending: true });

  if (error) throw error;
  const rows = data ?? [];

  const seen = new Set<string>();
  const events: RawTrackingEvent[] = rows.map((row) => {
    const isFirst = !seen.has(row.element_type);
    seen.add(row.element_type);
    return { ...row, signal: isFirst ? "first" : "repeat" };
  });

  const summary: ElementSummary[] = ELEMENT_TYPES.map(({ slug, label }) => {
    const matches = events.filter((e) => e.element_type === slug);
    return {
      slug,
      label,
      isControl: false,
      requestCount: matches.length,
      firstRequestAt: matches[0]?.occurred_at ?? null,
      lastRequestAt: matches.at(-1)?.occurred_at ?? null,
    };
  });

  // Canvas is always shown, always zero — it never has a tracking URL.
  summary.push({
    slug: CONTROL_ELEMENT.slug,
    label: CONTROL_ELEMENT.label,
    isControl: true,
    requestCount: 0,
    firstRequestAt: null,
    lastRequestAt: null,
  });

  return { summary, events: events.reverse() }; // newest first for display
}
