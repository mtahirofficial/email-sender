import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listConnectedAccounts } from "@/lib/accounts";
import { isAdminUser } from "@/lib/admin";
import { listTrackingTests, getOwnedTrackingTest, getTrackingResults } from "@/lib/email-test/store";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/marketing/SiteFooter";
import { toHeaderUser } from "@/lib/header-user";
import EmailTestNewForm from "@/components/EmailTestNewForm";
import EmailTestSendForm from "@/components/EmailTestSendForm";
import EmailTestResults from "@/components/EmailTestResults";
import RefreshButton from "@/components/RefreshButton";
import LocalTime from "@/components/LocalTime";

export const metadata: Metadata = {
  title: "HTML tracking element test",
  robots: { index: false, follow: false },
};

export default async function EmailTestPage({
  searchParams,
}: {
  searchParams: { test?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Admin-only tool: everyone else gets a plain 404, so it does not even look like it exists.
  if (!isAdminUser(user)) {
    notFound();
  }

  const [accounts, tests] = await Promise.all([
    listConnectedAccounts(supabase, user.id),
    listTrackingTests(supabase, user.id),
  ]);

  const selectedPublicId = searchParams.test ?? tests[0]?.public_test_id;
  const selectedTest = selectedPublicId
    ? await getOwnedTrackingTest(supabase, user.id, selectedPublicId)
    : null;
  const results = selectedTest ? await getTrackingResults(supabase, selectedTest.id) : null;

  return (
    <>
      <SiteHeader initialUser={toHeaderUser(user)} />

      <main id="main" className="mx-auto w-full flex-1 max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-serif text-3xl text-ink">HTML tracking element test</h1>
        <p className="mb-8 mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Find out which HTML elements and resources cause a request when this email is opened in a real mail
          client. Every test uses random, unguessable per-element URLs, and no JavaScript is used to trigger
          tracking.
        </p>

        <div className="grid gap-8 md:grid-cols-[300px_1fr] md:items-start">
          <div className="space-y-6">
            <section aria-labelledby="new-test-heading">
              <h2 id="new-test-heading" className="mb-2 font-serif text-lg text-ink">
                New test
              </h2>
              <EmailTestNewForm />
            </section>

            <section aria-labelledby="tests-heading">
              <h2 id="tests-heading" className="mb-2 font-serif text-lg text-ink">
                Your tests
              </h2>
              {tests.length === 0 ? (
                <p className="card px-4 py-5 text-sm text-ink-soft">No tests yet.</p>
              ) : (
                <ul className="card divide-y divide-line overflow-hidden">
                  {tests.map((t) => {
                    const isSelected = t.public_test_id === selectedPublicId;
                    return (
                      <li key={t.id}>
                        <Link
                          href={`/email-test?test=${t.public_test_id}`}
                          aria-current={isSelected ? "true" : undefined}
                          className={`block min-h-[44px] px-4 py-2.5 text-sm transition-colors ${
                            isSelected ? "bg-accent-soft text-accent-deep" : "text-ink hover:bg-mist"
                          }`}
                        >
                          <span className="block truncate">{t.label || t.public_test_id}</span>
                          <span className="block text-xs text-ink-soft">
                            <LocalTime iso={t.created_at} dateOnly />
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          <div className="space-y-8">
            {!selectedTest ? (
              <div className="card px-6 py-12 text-center text-sm text-ink-soft">
                Create a test to get started.
              </div>
            ) : (
              <>
                <section aria-labelledby="selected-heading" className="card p-5">
                  <h2 id="selected-heading" className="font-serif text-xl text-ink">
                    {selectedTest.label || "Test"}{" "}
                    <span className="font-sans text-sm font-normal text-ink-soft">
                      ({selectedTest.public_test_id})
                    </span>
                  </h2>
                  <p className="mb-4 mt-1 text-sm leading-relaxed text-ink-soft">
                    Send this same test to yourself in different mail clients (Gmail web and mobile, Outlook,
                    Yahoo Mail, Apple Mail). Every open reports back to this one test ID.
                  </p>
                  <EmailTestSendForm testId={selectedTest.public_test_id} accounts={accounts} />
                </section>

                <section aria-labelledby="results-heading">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 id="results-heading" className="font-serif text-xl text-ink">
                      Results
                    </h2>
                    <RefreshButton />
                  </div>
                  {results && <EmailTestResults summary={results.summary} events={results.events} />}
                </section>
              </>
            )}
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
