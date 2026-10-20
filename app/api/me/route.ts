import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toHeaderUser } from "@/lib/header-user";

export const dynamic = "force-dynamic";

// Lets statically generated pages (landing, blog, legal) show the signed-in header.
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return NextResponse.json(
    { user: user ? toHeaderUser(user) : null },
    { headers: { "Cache-Control": "no-store" } }
  );
}
