import { SITE_NAME, SITE_URL } from "@/lib/site";
import nodemailer from "nodemailer";

type AuthEmailKind = "signup" | "welcome" | "recovery" | "password_changed";
type AuthEmailInput = { to: string; kind: AuthEmailKind; link?: string; code?: string };

const esc = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

function frame(title: string, intro: string, content: string, notice: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(title)}</title></head><body style="margin:0;padding:0;background:#f4f6fb;color:#171a2b;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6fb;padding:36px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border:1px solid #e6e8ef;border-radius:16px;overflow:hidden"><tr><td style="padding:25px 32px;background:#171a2b"><img src="${SITE_URL}/email-outbox-logo.png" width="180" alt="Outbox" style="display:block;width:180px;height:auto;border:0"></td></tr><tr><td style="padding:34px 32px 24px"><h1 style="margin:0 0 12px;color:#171a2b;font-size:25px;line-height:1.3">${esc(title)}</h1><p style="margin:0 0 22px;color:#62677a;font-size:15px;line-height:1.65">${esc(intro)}</p>${content}<div style="margin-top:24px;padding:14px 15px;background:#f4f6fb;border-radius:9px;color:#62677a;font-size:13px;line-height:1.6">${esc(notice)}</div></td></tr><tr><td style="padding:0 32px 27px;color:#85899a;font-size:12px;line-height:1.6">Automated account security email from ${SITE_NAME}. Please don’t reply.</td></tr></table></td></tr></table></body></html>`;
}

function actionBlock(link: string, code?: string) {
  const safeLink = esc(link);
  return `<div style="padding:4px 0 24px;text-align:center"><a href="${safeLink}" style="display:inline-block;padding:14px 24px;border-radius:9px;background:#6d5ce8;color:#fff;text-decoration:none;font-size:15px;font-weight:700">Continue to Outbox</a></div>${code ? `<div style="border-top:1px solid #e8eaf0;padding-top:22px"><p style="margin:0 0 9px;color:#62677a;font-size:12px;font-weight:700;letter-spacing:.6px;text-align:center;text-transform:uppercase">Or enter this security code</p><div style="padding:16px 10px;border:1px solid #dce3e8;border-radius:10px;background:#f0edff;color:#5142c4;font-family:'Courier New',monospace;font-size:29px;font-weight:700;letter-spacing:7px;text-align:center">${esc(code)}</div></div>` : ""}<p style="margin:18px 0 0;color:#777c8d;font-size:12px;line-height:1.6">If the button doesn’t work, copy this link into your browser:<br><a href="${safeLink}" style="color:#6d5ce8;word-break:break-all">${safeLink}</a></p>`;
}

function render(kind: AuthEmailKind, link?: string, code?: string) {
  switch (kind) {
    case "signup":
      return { subject: "Confirm your Outbox email address", html: frame("Confirm your email", "Thanks for creating an Outbox account. Confirm your email address to finish setting it up.", actionBlock(link ?? "", code), "If you didn’t create an Outbox account, you can ignore this email.") };
    case "welcome":
      return { subject: "Welcome to Outbox", html: frame("Welcome to Outbox", "Your email address is confirmed and your account is ready.", `<p style="margin:0;color:#62677a;font-size:15px;line-height:1.65">Connect Gmail or Outlook when you’re ready, then send individual emails from your own address.</p><div style="padding:26px 0 4px;text-align:center"><a href="${SITE_URL}/login" style="display:inline-block;padding:14px 24px;border-radius:9px;background:#6d5ce8;color:#fff;text-decoration:none;font-size:15px;font-weight:700">Sign in to Outbox</a></div>`, "You can sign in at any time using your email address and password.") };
    case "recovery":
      return { subject: "Reset your Outbox password", html: frame("Reset your password", "We received a request to reset the password for your Outbox account. Use the secure link or security code below.", actionBlock(link ?? "", code), "If you didn’t request a password reset, ignore this email. Your password won’t change unless you use the link or code.") };
    case "password_changed":
      return { subject: "Your Outbox password was changed", html: frame("Password updated", "The password for your Outbox account was changed successfully.", `<p style="margin:0;color:#62677a;font-size:15px;line-height:1.65">If you made this change, no further action is needed.</p>`, "If you didn’t change your password, reset it immediately and contact Outbox support.") };
  }
}

export async function sendAuthEmail(input: AuthEmailInput) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.AUTH_EMAIL_FROM;
  if (!host || !user || !pass || !from) throw new Error("Auth email delivery is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS, and AUTH_EMAIL_FROM.");
  const template = render(input.kind, input.link, input.code);
  const transport = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  await transport.sendMail({ from, to: input.to, subject: template.subject, html: template.html });
}
