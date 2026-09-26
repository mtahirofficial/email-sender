import crypto from "crypto";

/**
 * Every HTML element/resource under test, other than <canvas> which is a
 * control (see CONTROL_ELEMENT below) and is never sent a request by design.
 */
export const ELEMENT_TYPES = [
  { slug: "img", label: "IMG" },
  { slug: "background", label: "CSS Background" },
  { slug: "video-poster", label: "Video Poster" },
  { slug: "video-src", label: "Video Source" },
  { slug: "audio-src", label: "Audio Source" },
  { slug: "source-src", label: "<source> Tag" },
  { slug: "track-src", label: "<track> Tag" },
  { slug: "object-data", label: "Object Data" },
  { slug: "embed-src", label: "Embed Source" },
  { slug: "iframe-src", label: "IFrame Source" },
  { slug: "script-src", label: "Script Source" },
  { slug: "link-href", label: "Link Href" },
  { slug: "input-image", label: "Input Type=Image" },
  { slug: "svg-image", label: "SVG <image> Href" },
] as const;

export type ElementSlug = (typeof ELEMENT_TYPES)[number]["slug"];

export const ELEMENT_SLUGS: ElementSlug[] = ELEMENT_TYPES.map((e) => e.slug);

/** <canvas> generates no request by construction — it's the control test. */
export const CONTROL_ELEMENT = { slug: "canvas", label: "Canvas (control)" } as const;

export function isElementSlug(value: string): value is ElementSlug {
  return (ELEMENT_SLUGS as string[]).includes(value);
}

/** Short, URL-safe, cryptographically random identifier. */
function randomId(bytes: number) {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** Public test ID — safe to embed in tracking URLs, never the DB row id. */
export function generatePublicTestId() {
  return randomId(12); // 16 chars
}

/** One unguessable token per element type, so a URL can't be reused across tests or forged. */
export function generateElementTokens(): Record<ElementSlug, string> {
  const tokens = {} as Record<ElementSlug, string>;
  for (const slug of ELEMENT_SLUGS) {
    tokens[slug] = randomId(9); // 12 chars
  }
  return tokens;
}

export function buildTrackingUrl(
  appUrl: string,
  publicTestId: string,
  elementType: ElementSlug,
  token: string
) {
  return `${appUrl}/email-test/track/${publicTestId}/${elementType}?t=${token}`;
}
