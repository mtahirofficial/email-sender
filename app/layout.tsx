import type { Metadata, Viewport } from "next";
import { Inter, Orbitron, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/site";
import ToastProvider from "@/components/Toaster";
import SessionGuard from "@/components/SessionGuard";
import WorkspaceChrome from "@/components/WorkspaceChrome";
import ThemeBootstrap from "@/components/ThemeBootstrap";
import FloatingThemeToggle from "@/components/FloatingThemeToggle";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

// Two static weights instead of the full variable font keeps the download small.
const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
  weight: ["400", "600"],
});

const orbitron = Orbitron({
  subsets: ["latin"],
  variable: "--font-brand",
  display: "swap",
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  formatDetection: { email: false, address: false, telephone: false },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F7F8FC",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${sourceSerif.variable} ${orbitron.variable}`}>
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to main content
        </a>
        <ToastProvider>
          <SessionGuard />
          <ThemeBootstrap />
          <WorkspaceChrome />
          <FloatingThemeToggle />
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
