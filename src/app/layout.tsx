import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AppDataProvider } from "@/components/AppDataProvider";
import { Shell } from "@/components/Shell";
import { LoginAwareShell } from "@/components/LoginAwareShell";

export const metadata: Metadata = {
  title: "Programming Club — Admin panel",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the saved colour theme before the first paint (same key and attribute as the public website), so there is no flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme')||'dark';document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <AppDataProvider>
          <LoginAwareShell shell={Shell}>{children}</LoginAwareShell>
        </AppDataProvider>
      </body>
    </html>
  );
}
