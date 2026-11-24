export const SITE_NAME = "Outbox";
export const SITE_TITLE = "Outbox: Send email from Gmail, Outlook or your SMTP server";
export const SITE_DESCRIPTION =
  "Connect Gmail, Outlook or your SMTP server and send individual emails from your own address, with a different subject for each recipient.";

/** Public base URL, no trailing slash. Same variable the OAuth flows already use. */
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");

/** Shown on the legal pages when set (add NEXT_PUBLIC_CONTACT_EMAIL in your hosting environment variables). */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "";

export const LEGAL_UPDATED = "October 15, 2026";

/** Screenshot of the homepage hero used for social previews. */
export const OG_IMAGE = {
  url: "/og-homepage-v2.png",
  width: 1200,
  height: 630,
  alt: "Outbox homepage: send email from Gmail, Outlook or your own SMTP server",
};
