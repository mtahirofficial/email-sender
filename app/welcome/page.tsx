import Landing from "@/components/marketing/Landing";
import { landingMetadata } from "@/components/marketing/landing-metadata";

// "/" is rewritten to this page for signed-out visitors, so it is the page
// search engines index at the root URL. It reads no cookies, so it is static.
export const metadata = landingMetadata;

export default function WelcomePage() {
  return <Landing />;
}
