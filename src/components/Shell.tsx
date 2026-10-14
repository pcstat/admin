"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { SECTIONS } from "@/lib/schemas";
import { useContentStore } from "@/store/content-store";
import { SaveBar } from "./SaveBar";

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const dirty = useContentStore((s) => s.dirty);
  const provider = useContentStore((s) => s.provider);
  const websiteUrl = process.env.NEXT_PUBLIC_WEBSITE_URL;

  // Leaving or reloading the tab would lose the drafts.
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  async function logout() {
    if (dirty && !window.confirm("You have unsaved changes. Sign out and lose them?")) return;
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.replace(new URL("/login", window.location.origin).href);
  }

  const link = (href: string, label: string) => (
    <Link key={href} href={href} className={`nav-link ${pathname === href ? "active" : ""}`}>
      {label}
    </Link>
  );

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-kicker">PROGRAMMING CLUB</span>
          <strong>Admin panel</strong>
        </div>
        <nav>
          <p className="nav-title">Content</p>
          {SECTIONS.map((s) => link(`/${s.slug}`, s.title))}
          <p className="nav-title">Files</p>
          {link("/members", "Member files")}
        </nav>
        <div className="sidebar-foot">
          {provider === "local-fs" && <p className="badge warn" title="Edits go to a local folder, not GitHub.">Local test mode</p>}
          {websiteUrl && (
            <a href={websiteUrl} target="_blank" rel="noreferrer" className="nav-link">
              Open website ↗
            </a>
          )}
          <button className="nav-link as-button" onClick={logout}>Sign out</button>
        </div>
      </aside>
      <div className="content">
        <SaveBar />
        <main className="page">{children}</main>
      </div>
    </div>
  );
}
