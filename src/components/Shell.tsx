"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { SECTIONS } from "@/lib/schemas";
import { useContentStore } from "@/store/content-store";
import { SaveBar } from "./SaveBar";
import { SitePreview } from "./SitePreview";

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const dirty = useContentStore((s) => s.dirty);
  const provider = useContentStore((s) => s.provider);
  const collapsed = useContentStore((s) => s.navCollapsed);
  const previewMode = useContentStore((s) => s.previewMode);
  const websiteUrl = process.env.NEXT_PUBLIC_WEBSITE_URL;

  // Remember the folded sidebar between visits (read after mount so the server and first client render agree).
  useEffect(() => {
    try {
      if (window.localStorage.getItem("admin-nav-collapsed") === "1") useContentStore.getState().setNavCollapsed(true);
    } catch {
      /* ignore */
    }
  }, []);

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
    <Link key={href} href={href} className={`nav-link ${pathname === href || pathname.startsWith(`${href}/`) ? "active" : ""}`}>
      {label}
    </Link>
  );

  return (
    <div className={`shell${collapsed ? " nav-collapsed" : ""}`}>
      <aside className={`sidebar${collapsed ? " collapsed" : ""}`}>
        <div className="sidebar-top">
          {!collapsed && (
            <div className="brand">
              <span className="brand-kicker">PROGRAMMING CLUB</span>
              <strong>Admin panel</strong>
            </div>
          )}
          <button type="button" className="nav-toggle" onClick={() => useContentStore.getState().setNavCollapsed(!collapsed)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {collapsed ? "›" : "‹"}
          </button>
        </div>
        {!collapsed && (
          <>
            <button
              type="button"
              className={`preview-toggle-btn${previewMode ? " active" : ""}`}
              disabled={!websiteUrl}
              title={websiteUrl ? "Show the website with your unsaved changes" : "Set NEXT_PUBLIC_WEBSITE_URL to enable the preview"}
              onClick={() => useContentStore.getState().setPreviewMode(!previewMode)}
            >
              {previewMode ? "✕ Exit preview" : "👁 Preview site"}
            </button>
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
          </>
        )}
      </aside>
      <div className="content">
        <SaveBar />
        <main className="page">{previewMode ? <SitePreview /> : children}</main>
      </div>
    </div>
  );
}
