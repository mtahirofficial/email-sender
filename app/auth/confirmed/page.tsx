import Link from "next/link";

export default function SignupConfirmedPage() {
  return <main id="main" className="flex flex-1 items-center justify-center px-5 py-12"><section className="card w-full max-w-md p-7 text-center"><h1 className="font-serif text-3xl text-ink">Email confirmed</h1><p className="mt-3 text-sm leading-relaxed text-ink-soft">Your Outbox account is ready. You can now connect a mailbox and start sending.</p><Link href="/compose" className="btn-primary mt-6">Continue to Outbox</Link></section></main>;
}
