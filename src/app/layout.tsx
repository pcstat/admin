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
    <html lang="en">
      <body>
        <AppDataProvider>
          <LoginAwareShell shell={Shell}>{children}</LoginAwareShell>
        </AppDataProvider>
      </body>
    </html>
  );
}
