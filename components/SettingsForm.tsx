"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { HeaderUser } from "@/lib/header-user";
import { AlertIcon, CheckIcon, SpinnerIcon } from "@/components/icons";

type Notice = { ok: boolean; text: string } | null;

function NoticeLine({ notice }: { notice: Notice }) {
  return (
    <div aria-live="polite" className="min-h-[1.25rem] text-sm">
      {notice && (
        <p className={`flex items-center gap-2 ${notice.ok ? "text-accent-deep" : "text-red-700"}`}>
          {notice.ok ? <CheckIcon className="h-4 w-4 shrink-0" /> : <AlertIcon className="h-4 w-4 shrink-0" />} {notice.text}
        </p>
      )}
    </div>
  );
}

function Section({ title, description, children, danger = false }: { title: string; description: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <section className={`card p-5 sm:p-7 ${danger ? "border-red-200" : ""}`}>
      <h2 className={`font-serif text-xl ${danger ? "text-red-800" : "text-ink"}`}>{title}</h2>
      <p className="mb-5 mt-1 text-sm leading-relaxed text-ink-soft">{description}</p>
      {children}
    </section>
  );
}

export default function SettingsForm({ user }: { user: HeaderUser }) {
  const router = useRouter();
  const supabase = createClient();

  // profile
  const [name, setName] = useState(user.name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [nameNotice, setNameNotice] = useState<Notice>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoNotice, setPhotoNotice] = useState<Notice>(null);

  // password
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [pwNotice, setPwNotice] = useState<Notice>(null);

  // delete
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteNotice, setDeleteNotice] = useState<Notice>(null);

  const initial = (user.name ?? user.email)[0]?.toUpperCase() ?? "?";

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setSavingName(true);
    setNameNotice(null);
    const { error } = await supabase.auth.updateUser({ data: { full_name: name.trim() } });
    setSavingName(false);
    if (error) return setNameNotice({ ok: false, text: error.message });
    setNameNotice({ ok: true, text: "Name saved." });
    router.refresh();
  }

  async function uploadPhoto(file: File) {
    setPhotoBusy(true);
    setPhotoNotice(null);
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/account/avatar", { method: "POST", body });
    const data = await res.json().catch(() => ({}));
    setPhotoBusy(false);
    if (!res.ok) return setPhotoNotice({ ok: false, text: data.error ?? "Upload failed." });
    setPhotoNotice({ ok: true, text: "Photo updated." });
    router.refresh();
  }

  async function removePhoto() {
    setPhotoBusy(true);
    setPhotoNotice(null);
    const res = await fetch("/api/account/avatar", { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setPhotoBusy(false);
    if (!res.ok) return setPhotoNotice({ ok: false, text: data.error ?? "Could not remove the photo." });
    setPhotoNotice({ ok: true, text: "Photo removed." });
    router.refresh();
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwNotice(null);
    if (password.length < 8) return setPwNotice({ ok: false, text: "Use at least 8 characters." });
    if (password !== confirm) return setPwNotice({ ok: false, text: "The two passwords don't match." });

    setSavingPw(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSavingPw(false);
    if (error) return setPwNotice({ ok: false, text: error.message });
    setPassword("");
    setConfirm("");
    setPwNotice({ ok: true, text: "Password updated." });
  }

  async function sendResetLink() {
    setPwNotice(null);
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/settings`,
    });
    setPwNotice(error ? { ok: false, text: error.message } : { ok: true, text: `Reset link sent to ${user.email}.` });
  }

  async function deleteAccount(e: React.FormEvent) {
    e.preventDefault();
    setDeleting(true);
    setDeleteNotice(null);
    const res = await fetch("/api/account/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: confirmText }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setDeleting(false);
      return setDeleteNotice({ ok: false, text: data.error ?? "Could not delete your account." });
    }
    await supabase.auth.signOut().catch(() => undefined);
    router.push("/");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Section title="Profile" description="Your name and photo appear in the account menu.">
        <div className="mb-6 flex items-center gap-4">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="Your profile photo" width={72} height={72} className="h-[72px] w-[72px] rounded-full object-cover" />
          ) : (
            <span aria-hidden="true" className="grid h-[72px] w-[72px] place-items-center rounded-full bg-accent font-serif text-3xl text-white">
              {initial}
            </span>
          )}
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <label className="btn-secondary cursor-pointer min-h-[40px]">
                {photoBusy && <SpinnerIcon />} {user.avatarUrl ? "Change photo" : "Upload photo"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void uploadPhoto(file);
                  }}
                />
              </label>
              {user.avatarUrl && (
                <button type="button" onClick={removePhoto} disabled={photoBusy} className="btn-ghost min-h-[40px]">Remove</button>
              )}
            </div>
            <p className="text-xs text-ink-soft">JPG, PNG or WebP, up to 2 MB.</p>
          </div>
        </div>
        <NoticeLine notice={photoNotice} />

        <form onSubmit={saveName} className="mt-4 space-y-4">
          <div>
            <label htmlFor="full-name" className="label">Full name</label>
            <input id="full-name" value={name} maxLength={80} autoComplete="name" onChange={(e) => setName(e.target.value)} className="input" placeholder="Your name" />
          </div>
          <div>
            <label htmlFor="account-email" className="label">Email</label>
            <input id="account-email" value={user.email} readOnly className="input cursor-not-allowed opacity-70" />
          </div>
          <button type="submit" disabled={savingName} className="btn-primary">
            {savingName && <SpinnerIcon />} Save profile
          </button>
          <NoticeLine notice={nameNotice} />
        </form>
      </Section>

      <Section title="Password" description="Choose a new password, or have a reset link emailed to you.">
        <form onSubmit={changePassword} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="new-password" className="label">New password</label>
              <input id="new-password" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
            </div>
            <div>
              <label htmlFor="confirm-password" className="label">Confirm password</label>
              <input id="confirm-password" type="password" autoComplete="new-password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} className="input" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={savingPw} className="btn-primary">
              {savingPw && <SpinnerIcon />} Update password
            </button>
            <button type="button" onClick={sendResetLink} className="btn-ghost">Email me a reset link</button>
          </div>
          <NoticeLine notice={pwNotice} />
        </form>
      </Section>

      <Section
        danger
        title="Delete account"
        description="This permanently deletes your account, connected mailboxes, sent history and profile photo. It can't be undone."
      >
        <form onSubmit={deleteAccount} className="space-y-4">
          <div>
            <label htmlFor="delete-confirm" className="label">Type DELETE to confirm</label>
            <input id="delete-confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" className="input max-w-xs" />
          </div>
          <button
            type="submit"
            disabled={deleting || confirmText !== "DELETE"}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-red-700 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting && <SpinnerIcon />} Delete my account
          </button>
          <NoticeLine notice={deleteNotice} />
        </form>
      </Section>
    </div>
  );
}
