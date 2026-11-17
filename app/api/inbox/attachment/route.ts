import { NextRequest, NextResponse } from "next/server";
import { downloadInboxAttachment } from "@/lib/inbox";
import { inboxRoute } from "@/lib/inbox-route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = (request: NextRequest) =>
  inboxRoute(async ({ supabase, user }) => {
    const q = request.nextUrl.searchParams;
    const account = q.get("account") ?? "";
    const threadId = q.get("thread") ?? "";
    const messageId = q.get("message") ?? "";
    const attachmentId = q.get("attachment") ?? "";
    const filename = q.get("filename") ?? "attachment";
    const mimeType = q.get("type") ?? "application/octet-stream";
    const size = Number(q.get("size") ?? 0);
    const openInTab = q.get("open") === "1";
    const { attachment, bytes } = await downloadInboxAttachment(supabase, user.id, account, threadId, messageId, attachmentId, { filename, mimeType, size });
    const safeName = attachment.filename.replace(/[\r\n"\\]/g, "_").slice(0, 180) || "attachment";
    const previewable = /^(application\/pdf|image\/(png|jpeg|gif|webp|avif|bmp|x-icon)|audio\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+|text\/(plain|csv))$/i.test(attachment.mimeType);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": /^[\w.+-]+\/[\w.+-]+$/.test(attachment.mimeType) ? attachment.mimeType : "application/octet-stream",
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `${openInTab && previewable ? "inline" : "attachment"}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
