"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { SECTIONS, type NavGroup } from "@/lib/schemas";
import { changedSections } from "@/lib/changes";
import { useTheme } from "@/lib/theme";
import { WEBSITE_URL } from "@/lib/site-config";
import { useContentStore } from "@/store/content-store";
import { SaveBar } from "./SaveBar";
import { SitePreview } from "./SitePreview";
import { Icon } from "./Icon";

const GROUPS: { id: NavGroup; title: string }[] = [
  { id: "pages", title: "// WEBSITE PAGES" },
  { id: "site", title: "// SITE" },
];

const MOON = <Icon name="moon" size={10} />;
const SUN = <Icon name="sun" size={10} />;

interface Tip {
  label: string;
  top: number;
  left: number;
}

/**
 * The admin layout: the public website's sidebar, mobile top bar and menu, with the same icons, theme switch and hover motion.
 * The pages in the menu mirror the website's pages (same order, same names); site-wide settings have their own page.
 */
export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const dirty = useContentStore((s) => s.dirty);
  const collapsed = useContentStore((s) => s.navCollapsed);
  const previewMode = useContentStore((s) => s.previewMode);
  const clubName = useContentStore((s) => (s.docs["site.json"]?.draft as { club?: { name?: string } } | undefined)?.club?.name ?? "Club");
  const [menuOpen, setMenuOpen] = useState(false);
  const [tip, setTip] = useState<Tip | null>(null);
  const [theme, toggleTheme] = useTheme();
  const websiteUrl = WEBSITE_URL;
  // Files with unsaved edits, to put a dot next to the pages that edit them.
  const changedSlugs = useContentStore(useShallow((s) => changedSections(s.docs).map((c) => c.slug)));
  const memberFilesChanged = useContentStore((s) => Object.values(s.memberDrafts).some((m) => m.original === null || m.draft !== m.original));
  const sectionChanged = (slug: string) => changedSlugs.includes(slug);

  // Remember the folded sidebar and the "publish on save" choice between visits (read after mount so the server and first client render agree).
  useEffect(() => {
    try {
      if (window.localStorage.getItem("admin-nav-collapsed") === "1") useContentStore.getState().setNavCollapsed(true);
      if (window.localStorage.getItem("admin-publish-on-save") === "0") useContentStore.getState().setPublishOnSave(false);
    } catch {
      /* ignore */
    }
  }, []);

  // Ctrl/⌘+S saves, like in any editor.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        const st = useContentStore.getState();
        if (st.dirty && st.saveStatus !== "saving") void st.save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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

  // The full-screen mobile menu locks the page behind it.
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  async function logout() {
    if (dirty && !window.confirm("You have unsaved changes. Sign out and lose them?")) return;
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.replace(new URL("/login", window.location.origin).href);
  }

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  const showTip = (label: string) => (event: React.SyntheticEvent<HTMLElement>) => {
    if (!collapsed) return;
    const r = event.currentTarget.getBoundingClientRect();
    setTip({ label, top: r.top + r.height / 2, left: r.right + 10 });
  };
  const hideTip = () => setTip(null);
  const toggleSidebar = () => {
    setTip(null);
    useContentStore.getState().setNavCollapsed(!collapsed);
  };
  const themeLabel = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";

  const entries = (group: NavGroup) => SECTIONS.filter((s) => s.group === group && !s.hidden).map((s) => ({ href: `/${s.slug}`, label: s.title, icon: s.icon, changed: sectionChanged(s.slug) }));

  const item = (href: string, label: string, icon: string, changed = false, onClick?: () => void) => (
    <li key={href} className={`ni ${isActive(href) ? "active" : ""}`} onMouseEnter={showTip(label)} onMouseLeave={hideTip} onFocus={showTip(label)} onBlur={hideTip}>
      <Link href={href} onClick={onClick} aria-current={isActive(href) ? "page" : undefined}>
        <span className="nic"><Icon name={icon} size={18} /></span>
        <span className="nil">{label}</span>
        {changed && <span className="nav-dot" title="Unsaved changes on this page" />}
      </Link>
    </li>
  );

  const files = { href: "/members", label: "Member files", icon: "folder" };

  return (
    <div className="shell">
      {/* ── sidebar (desktop) ── */}
      <nav className={`sb ${collapsed ? "col" : ""}`} aria-label="Admin sections">
        <div className="sbh">
          <div className="sbb">
            <div className="lm"><Link href="/">{clubName}<span>.</span></Link></div>
            <div className="ls">{"// Admin panel"}</div>
          </div>
          <button type="button" className="sbt" title="Toggle sidebar" aria-label="Toggle sidebar" onClick={toggleSidebar}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M8.5 10.5L4.5 6.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>

        <ul className="nis">
          {item("/", "Dashboard", "dashboard")}
          {GROUPS.map((g) => (
            <li key={g.id} style={{ display: "contents" }}>
              <p className="nav-title">{g.title}</p>
              <ul style={{ display: "contents" }}>
                {entries(g.id).map((e) => item(e.href, e.label, e.icon, e.changed))}
                {g.id === "site" && item(files.href, files.label, files.icon, memberFilesChanged)}
              </ul>
            </li>
          ))}
        </ul>

        <div className="sb-theme">
          {websiteUrl && (
            <button type="button" className={`sb-theme-btn${previewMode ? " on" : ""}`} onClick={() => useContentStore.getState().setPreviewMode(!previewMode)} onMouseEnter={showTip(previewMode ? "Exit preview" : "Preview site")} onMouseLeave={hideTip}>
              <span className="nic"><Icon name={previewMode ? "close" : "eye"} size={18} /></span>
              <span className="nil">{previewMode ? "Exit preview" : "Preview site"}</span>
            </button>
          )}
          {websiteUrl && (
            <a className="sb-theme-btn" href={websiteUrl} target="_blank" rel="noreferrer" onMouseEnter={showTip("Open website")} onMouseLeave={hideTip}>
              <span className="nic"><Icon name="external" size={18} /></span>
              <span className="nil">Open website</span>
            </a>
          )}
          <button type="button" className="sb-theme-btn" id="theme-toggle" onClick={toggleTheme} aria-label={themeLabel} onMouseEnter={showTip(themeLabel)} onMouseLeave={hideTip}>
            <span className="nic"><Icon name={theme === "dark" ? "moon" : "sun"} size={18} /></span>
            <span className="nil">{theme === "dark" ? "Dark mode" : "Light mode"}</span>
            <span className="theme-switch sb-theme-switch" aria-hidden="true"><span className="switch-thumb">{theme === "dark" ? MOON : SUN}</span></span>
          </button>
          <button type="button" className="sb-theme-btn" onClick={logout} onMouseEnter={showTip("Sign out")} onMouseLeave={hideTip}>
            <span className="nic"><Icon name="logout" size={18} /></span>
            <span className="nil">Sign out</span>
          </button>
        </div>

        <div className="sbf">
          <div className="sbfd" />
          <div className="sbfi">
            <div className={`st ${dirty ? "warn" : ""}`}><span className="std" />{dirty ? "Unsaved changes" : "All saved"}</div>
          </div>
        </div>
      </nav>
      {tip && collapsed && <div className="sb-tip" role="tooltip" style={{ top: tip.top, left: tip.left }}>{tip.label}</div>}

      {/* ── top bar + full-screen menu (phones and tablets) ── */}
      <nav className="tn">
        <div className="lm"><Link href="/" onClick={() => setMenuOpen(false)}>{clubName}<span>.</span></Link></div>
        <div className="tn-right">
          <button type="button" className="tn-theme-toggle" title={themeLabel} aria-label={themeLabel} onClick={toggleTheme}>
            <span className="theme-switch"><span className="switch-thumb">{theme === "dark" ? MOON : SUN}</span></span>
          </button>
          <button type="button" className={`hbg ${menuOpen ? "open" : ""}`} aria-label="Toggle menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
            <span /><span /><span />
          </button>
        </div>
      </nav>
      <div className={`mm ${menuOpen ? "open" : ""}`} id="mm">
        {[{ href: "/", label: "Dashboard", icon: "dashboard", changed: false }].map((e) => (
          <div key={e.href} className={`mi ${isActive(e.href) ? "active" : ""}`}>
            <Link href={e.href} onClick={() => setMenuOpen(false)}><span className="nic"><Icon name={e.icon} size={20} /></span>{e.label}</Link>
          </div>
        ))}
        {GROUPS.map((g) => (
          <div key={g.id} style={{ display: "contents" }}>
            <p className="nav-title">{g.title}</p>
            {[...entries(g.id), ...(g.id === "site" ? [{ ...files, changed: memberFilesChanged }] : [])].map((e) => (
              <div key={e.href} className={`mi ${isActive(e.href) ? "active" : ""}`}>
                <Link href={e.href} onClick={() => setMenuOpen(false)}>
                  <span className="nic"><Icon name={e.icon} size={20} /></span>
                  {e.label}
                  {e.changed && <span className="nav-dot" style={{ marginLeft: "auto" }} />}
                </Link>
              </div>
            ))}
          </div>
        ))}
        <p className="nav-title">{"// TOOLS"}</p>
        {websiteUrl && (
          <div className={`mi${previewMode ? " active" : ""}`}>
            <button type="button" onClick={() => { useContentStore.getState().setPreviewMode(!previewMode); setMenuOpen(false); }}>
              <span className="nic"><Icon name={previewMode ? "close" : "eye"} size={20} /></span>{previewMode ? "Exit preview" : "Preview site"}
            </button>
          </div>
        )}
        {websiteUrl && (
          <div className="mi">
            <a href={websiteUrl} target="_blank" rel="noreferrer"><span className="nic"><Icon name="external" size={20} /></span>Open website</a>
          </div>
        )}
        <div className="mi">
          <button type="button" onClick={logout}><span className="nic"><Icon name="logout" size={20} /></span>Sign out</button>
        </div>
      </div>

      <div className={`ct ${collapsed ? "col" : ""}`}>
        <SaveBar />
        <main className="page">{previewMode ? <SitePreview /> : children}</main>
      </div>
    </div>
  );
}
