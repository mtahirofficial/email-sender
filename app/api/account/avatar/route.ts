import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient, createAdminClient } from "@/lib/supabase/server";

const BUCKET = "avatars";
const MAX_BYTES = 2 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function fileNameFrom(url: unknown) {
  return typeof url === "string" && url.startsWith("/avatars/") ? url.slice("/avatars/".length) : null;
}

async function currentUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file uploaded." }, { status: 400 });

  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Use a JPG, PNG or WebP image." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Photo must be 2 MB or smaller." }, { status: 400 });

  const admin = createAdminClient();
  const name = `${crypto.randomBytes(8).toString("hex")}.${ext}`;

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(name, Buffer.from(await file.arrayBuffer()), { contentType: file.type, cacheControl: "31536000", upsert: false });
  if (uploadError) {
    console.error("avatar upload failed:", uploadError);
    return NextResponse.json({ error: "Upload failed. Is the avatars bucket created?" }, { status: 500 });
  }

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: { ...meta, avatar_url: `/avatars/${name}` },
  });
  if (updateError) {
    await admin.storage.from(BUCKET).remove([name]);
    return NextResponse.json({ error: "Could not save your photo." }, { status: 500 });
  }

  const previous = fileNameFrom(meta.avatar_url);
  if (previous) await admin.storage.from(BUCKET).remove([previous]);

  return NextResponse.json({ ok: true, url: `/avatars/${name}` });
}

export async function DELETE() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();
  const meta = { ...((user.user_metadata ?? {}) as Record<string, unknown>) };
  const previous = fileNameFrom(meta.avatar_url);
  delete meta.avatar_url;

  const { error } = await admin.auth.admin.updateUserById(user.id, { user_metadata: meta });
  if (error) return NextResponse.json({ error: "Could not remove your photo." }, { status: 500 });
  if (previous) await admin.storage.from(BUCKET).remove([previous]);

  return NextResponse.json({ ok: true });
}
