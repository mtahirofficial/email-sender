import Landing from "@/components/marketing/Landing";
import { landingMetadata } from "@/components/marketing/landing-metadata";

// The landing page is the home page for everyone, signed in or not. It reads
// no cookies, so it is fully static; the header looks the user up after load.
export const metadata = landingMetadata;

export default function HomePage() {
  return <Landing />;
}
