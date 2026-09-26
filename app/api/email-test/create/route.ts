import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createTrackingTest } from "@/lib/email-test/store";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const label = (body?.label as string | undefined)?.trim() || null;

  try {
    const test = await createTrackingTest(supabase, user.id, label);
    return NextResponse.json({ ok: true, testId: test.public_test_id, subject: test.subject });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Could not create the test." }, { status: 500 });
  }
}
