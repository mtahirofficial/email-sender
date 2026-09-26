import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listConnectedAccounts } from "@/lib/accounts";
import { listTrackingTests, getOwnedTrackingTest, getTrackingResults } from "@/lib/email-test/store";
import AppHeader from "@/components/AppHeader";
import EmailTestNewForm from "@/components/EmailTestNewForm";
import EmailTestSendForm from "@/components/EmailTestSendForm";
import EmailTestResults from "@/components/EmailTestResults";
import RefreshButton from "@/components/RefreshButton";

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
    <main className="min-h-screen">
      <AppHeader userEmail={user.email ?? ""} active="email-test" />

      <div className="max-w-4xl mx-auto px-6 py-10">
        <h1 className="font-serif text-xl text-ink mb-1">HTML Tracking Element Test</h1>
        <p className="text-sm text-ink-soft mb-8 max-w-2xl">
          Experimentally determine which HTML elements/resources cause a
          request when this email is opened in a real mail client. Every test
          uses cryptographically random, unguessable per-element URLs — no
          JavaScript is used to trigger tracking.
        </p>

        <div className="grid md:grid-cols-[280px_1fr] gap-10">
          <div className="space-y-6">
            <section>
              <h2 className="font-serif text-lg text-ink mb-2">New test</h2>
              <EmailTestNewForm />
            </section>

            <section>
              <h2 className="font-serif text-lg text-ink mb-2">Your tests</h2>
              <div className="border border-line bg-white divide-y divide-line">
                {tests.length === 0 && (
                  <p className="px-4 py-4 text-sm text-ink-soft">No tests yet.</p>
                )}
                {tests.map((t) => (
                  <Link
                    key={t.id}
                    href={`/email-test?test=${t.public_test_id}`}
                    className={`block px-4 py-2.5 text-sm ${
                      t.public_test_id === selectedPublicId
                        ? "bg-accent-soft text-accent-deep"
                        : "text-ink hover:bg-paper"
                    }`}
                  >
                    <p className="truncate">{t.label || t.public_test_id}</p>
                    <p className="text-xs text-ink-soft">
                      {new Date(t.created_at).toLocaleDateString()}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          </div>

          <div className="space-y-8">
            {!selectedTest ? (
              <div className="border border-line bg-white px-4 py-6 text-sm text-ink-soft">
                Create a test to get started.
              </div>
            ) : (
              <>
                <section>
                  <h2 className="font-serif text-lg text-ink mb-1">
                    {selectedTest.label || "Test"}{" "}
                    <span className="text-ink-soft text-sm font-sans font-normal">
                      ({selectedTest.public_test_id})
                    </span>
                  </h2>
                  <p className="text-sm text-ink-soft mb-3">
                    Send this same test to yourself in different mail clients
                    (Gmail web, Gmail mobile, Outlook web/desktop, Yahoo Mail,
                    Apple Mail...) — every open reports back to this one test ID.
                  </p>
                  <EmailTestSendForm testId={selectedTest.public_test_id} accounts={accounts} />
                </section>

                <section>
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="font-serif text-lg text-ink">Results</h2>
                    <RefreshButton />
                  </div>
                  {results && <EmailTestResults summary={results.summary} events={results.events} />}
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
