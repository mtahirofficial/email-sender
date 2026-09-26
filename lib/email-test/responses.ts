import type { ElementSlug } from "@/lib/email-test/tokens";

// The smallest valid transparent GIF (43 bytes) — used for every element
// type that expects an image response (img, background-image, poster, etc).
const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
  "base64"
);

const MINIMAL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>`;
const MINIMAL_VTT = "WEBVTT\n\n";
const MINIMAL_HTML = "<!doctype html><html><head><title></title></head><body></body></html>";
const INERT_JS = "/* tracking test resource — intentionally empty, no behavior */\n";
const EMPTY_CSS = "/* tracking test resource */\n";

export type TrackingResponse = { contentType: string; body: Buffer | string };

/**
 * Returns the minimal appropriate body + Content-Type for each element
 * type. These are intentionally not "real" playable media — the experiment
 * only measures whether a request happens, not whether playback works.
 */
export function buildTrackingResponse(elementType: ElementSlug): TrackingResponse {
  switch (elementType) {
    case "img":
    case "background":
    case "video-poster":
    case "object-data":
    case "embed-src":
    case "input-image":
      return { contentType: "image/gif", body: TRANSPARENT_GIF };
    case "svg-image":
      return { contentType: "image/svg+xml", body: MINIMAL_SVG };
    case "video-src":
      return { contentType: "video/mp4", body: Buffer.alloc(0) };
    case "audio-src":
    case "source-src":
      return { contentType: "audio/mpeg", body: Buffer.alloc(0) };
    case "track-src":
      return { contentType: "text/vtt", body: MINIMAL_VTT };
    case "iframe-src":
      return { contentType: "text/html", body: MINIMAL_HTML };
    case "script-src":
      return { contentType: "application/javascript", body: INERT_JS };
    case "link-href":
      return { contentType: "text/css", body: EMPTY_CSS };
    default:
      return { contentType: "application/octet-stream", body: Buffer.alloc(0) };
  }
}
