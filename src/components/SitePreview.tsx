"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { buildPreviewPayload, PREVIEW_DATA, PREVIEW_READY, websiteRouteFor } from "@/lib/preview-payload";
import { useContentStore } from "@/store/content-store";

const WEBSITE_URL = process.env.NEXT_PUBLIC_WEBSITE_URL?.replace(/\/$/, "");

/**
 * Whole-site preview: the real website in an iframe, fed with the drafts (nothing is saved).
 * Needs NEXT_PUBLIC_WEBSITE_URL here and NEXT_PUBLIC_ADMIN_ORIGIN (= this panel's address) on the website.
 */
export function SitePreview() {
  const pathname = usePathname();
  const frame = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);
  const state = useContentStore(useShallow((s) => ({ docs: s.docs, memberDrafts: s.memberDrafts, uploads: s.uploads })));
  const payload = useMemo(() => (WEBSITE_URL ? buildPreviewPayload(state) : null), [state]);
  const latest = useRef(payload);
  const src = WEBSITE_URL ? `${WEBSITE_URL}${websiteRouteFor(pathname)}` : "";

  useEffect(() => {
    ready.current = false; // a new page is loading; it announces itself when it is listening
  }, [src]);

  useEffect(() => {
    latest.current = payload;
    if (!ready.current || !payload || !WEBSITE_URL) return;
    const timer = window.setTimeout(() => frame.current?.contentWindow?.postMessage({ type: PREVIEW_DATA, payload }, WEBSITE_URL), 120);
    return () => window.clearTimeout(timer);
  }, [payload]);

  useEffect(() => {
    if (!WEBSITE_URL) return;
    const origin = new URL(WEBSITE_URL).origin;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== frame.current?.contentWindow) return;
      if ((event.data as { type?: string } | null)?.type !== PREVIEW_READY) return;
      ready.current = true; // the website (re)loaded and is listening
      if (latest.current) frame.current?.contentWindow?.postMessage({ type: PREVIEW_DATA, payload: latest.current }, origin);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (!WEBSITE_URL) {
    return (
      <div className="page-narrow">
        <h1>Site preview is not set up</h1>
        <p className="lead">
          Set <code>NEXT_PUBLIC_WEBSITE_URL</code> to the website&apos;s address (a GitHub repository variable of the admin repo; <code>.env.local</code> for local runs), and
          <code> NEXT_PUBLIC_ADMIN_ORIGIN</code> to this panel&apos;s address on the website repo. See <code>docs/DEPLOYMENT.md</code> in the website repo, “Live preview”.
        </p>
      </div>
    );
  }
  return (
    <div className="site-preview">
      <div className="site-preview-bar">
        <strong>Live preview</strong> — the website with your unsaved changes. Browse it like a visitor; nothing here is saved.
        <a href={src} target="_blank" rel="noreferrer">Saved version ↗</a>
      </div>
      {/* The key reloads the page when the admin page changes, so it opens the matching website page. */}
      <iframe key={src} ref={frame} src={src} title="Live site preview" />
    </div>
  );
}
