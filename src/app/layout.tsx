import type { Metadata, Viewport } from "next";
import "bootstrap/dist/css/bootstrap.min.css";
import localFont from "next/font/local";
import "./icons.css";
import "./globals.css";
import { AppNav } from "@/components/AppNav";
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE, SITE_URL } from "@/config";
import { ProjectProvider } from "@/state/ProjectProvider";

// Subset of Bootstrap Icons with only the glyphs the app uses (see scripts/build-icons.mjs).
const icons = localFont({ src: "./fonts/bootstrap-icons-subset.woff2", display: "swap", variable: "--font-icons", adjustFontFallback: false });

const DEFAULT_TITLE = `${APP_NAME} — ${APP_TAGLINE}`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: APP_NAME,
  title: { default: DEFAULT_TITLE, template: `%s — ${APP_NAME}` },
  description: APP_DESCRIPTION,
  keywords: ["mobile app roadmap", "app development plan", "project timeline", "AI project advisor", "app store launch checklist"],
  // Each route resolves "./" against its own path, giving every page its own canonical URL.
  alternates: { canonical: "./" },
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    locale: "en_US",
    title: DEFAULT_TITLE,
    description: APP_DESCRIPTION,
    url: "./",
  },
  twitter: { card: "summary_large_image", title: DEFAULT_TITLE, description: APP_DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: "#1b2a4e",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={icons.variable}>
      <body>
        <a href="#main" className="mr-skip">Skip to content</a>
        <ProjectProvider>
          <AppNav />
          <main id="main" tabIndex={-1}>{children}</main>
        </ProjectProvider>
      </body>
    </html>
  );
}
