import type { Metadata } from "next";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./globals.css";
import { AppNav } from "@/components/AppNav";
import { APP_NAME, APP_TAGLINE } from "@/config";
import { ProjectProvider } from "@/state/ProjectProvider";

export const metadata: Metadata = {
  title: { default: `${APP_NAME} — ${APP_TAGLINE}`, template: `%s — ${APP_NAME}` },
  description: "AI-assisted roadmap and project tracker that takes a mobile app from idea to production.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
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
