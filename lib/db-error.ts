/** Turns a Supabase error into a message an admin can act on. 42501 = row-level security refused the write. */
export function dbErrorMessage(error: { code?: string; message: string }, fallback: string) {
  if (error.code === "42501") {
    return "The database refused the write (row-level security). SUPABASE_SERVICE_ROLE_KEY is probably the anon key. Copy the service_role key from Supabase > Project Settings > API, update it in Vercel, then redeploy.";
  }
  return `${fallback}: ${error.message}`;
}
