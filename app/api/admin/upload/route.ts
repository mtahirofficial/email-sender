import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/require-admin";

const BUCKET = "blog-images";
const MAX_BYTES = 4 * 1024 * 1024; // Vercel rejects request bodies above ~4.5 MB
const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }

  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Use a JPG, PNG, WebP or GIF image." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image must be 4 MB or smaller." }, { status: 400 });

  // keep a readable name, add a random suffix so files never collide or get overwritten
  const base =
    file.name
      .replace(/\.[^.]+$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "image";
  const name = `${base}-${crypto.randomBytes(3).toString("hex")}.${ext}`;

  const { error } = await createAdminClient()
    .storage.from(BUCKET)
    .upload(name, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      cacheControl: "31536000",
      upsert: false,
    });

  if (error) {
    console.error("blog image upload failed:", error);
    return NextResponse.json({ error: "Upload failed. Is the blog-images bucket created?" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, name, url: `/images/${name}` });
}
