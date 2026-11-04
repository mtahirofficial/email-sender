import { NextRequest } from "next/server";
import { inboxRoute } from "@/lib/inbox-route";
import { openThread } from "@/lib/inbox";

export const dynamic = "force-dynamic";

export const GET = (request: NextRequest) => inboxRoute(({ supabase, user }) => openThread(supabase, user.id, request.nextUrl.searchParams.get("id") ?? ""));
