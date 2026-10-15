"use client";

import { AlertIcon } from "@/components/icons";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="grid min-h-screen place-items-center px-6">
      <div className="card max-w-md p-8 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-red-50 text-red-700">
          <AlertIcon className="h-6 w-6" />
        </span>
        <h1 className="mt-4 font-serif text-2xl text-ink">Something went wrong</h1>
        <p className="mt-2 text-ink-soft">An unexpected error occurred. Your data is safe. Please try again.</p>
        <button type="button" onClick={reset} className="btn-primary mt-6">
          Try again
        </button>
      </div>
    </main>
  );
}
