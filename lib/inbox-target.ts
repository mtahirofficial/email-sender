import { InboxError, type TargetInput } from "@/lib/inbox";

/** Reads which conversation a request is about: an Outbox conversation (id) or any inbox message (account + thread). */
export function targetFrom(source: { id?: unknown; account?: unknown; thread?: unknown }): TargetInput {
  const text = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  const input = { id: text(source.id), account: text(source.account), thread: text(source.thread) };
  if (!input.id && !(input.account && input.thread)) throw new InboxError("Choose a message first.", 400);
  return input;
}
