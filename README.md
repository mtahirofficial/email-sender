# Outbox

Send email that genuinely arrives from the sender's own Gmail or Outlook
address — not from a server-controlled "From" field. The user connects their
real mailbox with OAuth, and every send goes out through Google's or
Microsoft's own mail infrastructure, so SPF/DKIM/DMARC all pass normally and
nothing looks spoofed.

## How it works

1. A person creates an Outbox account (email + password, via Supabase Auth).
   This only signs them into the app itself.
2. From the dashboard they click **Connect Gmail** or **Connect Outlook**,
   which sends them through that provider's real OAuth consent screen,
   asking only for permission to *send* mail (`gmail.send` /
   `Mail.Send`) — never to read the inbox.
3. The resulting OAuth tokens are encrypted (AES-256-GCM) and stored in a
   Supabase Postgres table, scoped to that user with row-level security.
4. When they compose and send a message, the server looks up a valid
   (refreshing if needed) access token and calls the Gmail API or Microsoft
   Graph API directly. The email is sent by Google/Microsoft themselves, as
   that account — so the recipient's inbox shows the real, connected
   address as the sender.

Free-text "type any From address" was deliberately **not** built — that's
what's technically called email spoofing, and mail providers block or
spam-flag it. Connecting the real account via OAuth is the only way to make
this fully legitimate.

A **Sent** list on the dashboard shows every send attempt (successful and
failed) with recipient, subject and time, using a simple `email_logs` table.

An **HTML Tracking Element Test** module (`/email-test`) lets you send a
diagnostic email containing 14 different trackable HTML resources (img,
CSS background, video poster/source, audio, `<source>`, `<track>`, object,
embed, iframe, script, link, input[type=image], SVG image) plus a `<canvas>`
control that never fires — so you can see exactly which ones your mail
clients actually request. See "HTML Tracking Element Test module" below for
setup and usage.

## Stack

- **Next.js 14** (App Router) + TypeScript + Tailwind CSS
- **Supabase**: Auth (app login) + Postgres (encrypted token storage with RLS)
- **Gmail API** (`gmail.send` scope) and **Microsoft Graph API** (`Mail.Send`
  scope) for the actual sending

---

## 1. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Go to **SQL Editor → New query**, paste the contents of
   [`supabase/schema.sql`](./supabase/schema.sql), and run it. This creates
   the `connected_accounts` and `email_logs` tables with row-level security
   so a user can only ever read or write their own data.
   - Already ran an older version of `schema.sql` that only had
     `connected_accounts`? Just run
     [`supabase/migrations_add_email_logs.sql`](./supabase/migrations_add_email_logs.sql)
     instead — it only adds the new `email_logs` table.
3. Go to **Project Settings → API** and copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server-only, keep secret)
4. Go to **Authentication → URL Configuration** and set:
   - Site URL: `http://localhost:3000` (or your deployed URL)
   - Redirect URLs: add `http://localhost:3000/auth/callback` (and your
     production equivalent later)
5. (Optional) Under **Authentication → Providers → Email**, you can disable
   "Confirm email" during local testing to skip the confirmation step.

## 2. Set up Google OAuth (for "Connect Gmail")

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) →
   create/select a project.
2. **APIs & Services → Library** → enable the **Gmail API**.
3. **APIs & Services → OAuth consent screen**:
   - User type: External (or Internal if using Google Workspace)
   - Add the scope `https://www.googleapis.com/auth/gmail.send`
   - While the app is in "Testing" mode, add your own Google account under
     **Test users** so you can connect it
   - (For real public use later, Google requires an app verification review
     for the `gmail.send` scope — expect this before launching to strangers)
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: Web application
   - Authorized redirect URI: `http://localhost:3000/oauth/google/callback`
5. Copy the **Client ID** and **Client secret** into `.env.local`.

## 3. Set up Microsoft OAuth (for "Connect Outlook")

1. Go to the [Azure Portal](https://portal.azure.com/) → **App registrations
   → New registration**.
   - Supported account types: "Accounts in any organizational directory and
     personal Microsoft accounts" (so both work/school and @outlook.com/@hotmail.com work)
   - Redirect URI (Web): `http://localhost:3000/oauth/microsoft/callback`
2. **Certificates & secrets → New client secret** → copy the secret value
   immediately (it's only shown once).
3. **API permissions → Add a permission → Microsoft Graph → Delegated
   permissions** → add `Mail.Send`, `offline_access`, `User.Read`.
4. Copy the **Application (client) ID** and the client secret you created
   into `.env.local`.

## 4. Configure environment variables

```bash
cp .env.local.example .env.local
```

Fill in every value in `.env.local`. Generate the token-encryption key with:

```bash
openssl rand -hex 32
```

## 5. Run it

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), create an account,
connect Gmail and/or Outlook, and send a test email to yourself.

---

## Notes on going to production

- **Deploy** (e.g. Vercel) and update `NEXT_PUBLIC_APP_URL`, the Supabase
  redirect URL, and both OAuth apps' redirect URIs to your real domain.
- **Google verification**: apps requesting `gmail.send` for more than a
  handful of test users need to pass Google's OAuth app verification
  (includes a homepage, privacy policy, and a short review). Budget a few
  days for this before a public launch.
- **Rate limits**: Gmail and Microsoft Graph both cap how many messages an
  account can send per day — fine for a personal tool or small team, but
  worth knowing if usage grows.
- **Token encryption key**: back it up somewhere safe. If it's lost, every
  stored refresh token becomes unreadable and every connected account must
  be reconnected.

## HTML Tracking Element Test module

### Setup
Run [`supabase/migrations_add_email_tracking_test.sql`](./supabase/migrations_add_email_tracking_test.sql)
in the Supabase SQL Editor (already included in `schema.sql` for fresh
installs). No new environment variables are needed — it reuses
`NEXT_PUBLIC_APP_URL` to build tracking URLs.

### Using it
1. Go to **Tracking Test** in the nav.
2. Click **New test** (an optional label like "Gmail web attempt" just helps
   you tell tests apart later) — this generates a unique test ID and a
   random, unguessable token per element type.
3. Pick a connected account and a recipient address, then **Send this
   test**. You can send the *same* test multiple times, to different
   addresses or the same address opened in different clients (Gmail web,
   Gmail mobile, Outlook web/desktop, Yahoo Mail, Apple Mail...) — every
   open reports back to the one test ID.
4. Open the email in each client you want to test, then click **Refresh
   results**.
5. Read the results table: **Requests** is a count of resource requests the
   tracking endpoint received for that element — a *signal*, not a
   confirmed human "open" (some providers pre-fetch/proxy images). "First
   Request" vs "Repeat Request" in the raw log distinguishes the first hit
   per element from any subsequent ones (e.g. an image reloaded on scroll).
   **Canvas** should always read 0 — it has no tracking URL and is the
   experiment's control.

### Design notes / deviations from the literal spec
- No JavaScript is used anywhere in the test email or the tracking
  endpoint — every test relies purely on the mail client's own static
  resource loading.
- Recipient/account are **not** fixed on the test itself, since the whole
  point is sending one test ID to several different clients — each send is
  just logged via the existing `email_logs` table instead.
- The tracking URL includes a per-(test, element) random token as a `?t=`
  query parameter (`/email-test/track/{testId}/{elementType}?t={token}`),
  not just the raw element type, so a guessed or copy-pasted URL can't
  pollute another test's results.
- A request with an invalid test ID, element type, or token still gets a
  correctly-typed minimal response (so nothing looks visibly broken) but is
  **not** recorded, to keep results honest.

