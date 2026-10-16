"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { WEBSITE_URL } from "@/lib/site-config";
import { buildPreviewPayload, PREVIEW_DATA, PREVIEW_READY, websiteRouteFor } from "@/lib/preview-payload";
import { useContentStore } from "@/store/content-store";

/**
 * Whole-site preview: the real website in an iframe, fed with the drafts (nothing is saved).
 * The website address is the "website" field of this repo's database.json; the website must list this panel's address
 * as "admin" in its own database.json (or NEXT_PUBLIC_ADMIN_ORIGIN) before it accepts drafts.
 */
export function SitePreview() {
  const pathname = usePathname();
  if (!WEBSITE_URL) return <NotSetUp />;
  // The key remounts the frame (and its connection state) when the admin page changes, so it opens the matching website page.
  const src = `${WEBSITE_URL}${websiteRouteFor(pathname)}`;
  return <SiteFrame key={src} src={src} />;
}

function NotSetUp() {
  return (
    <div className="page-narrow">
      <h1>Site preview is not set up</h1>
      <p className="lead">
        Put the website&apos;s address in the <code>website</code> field of <code>database.json</code> (repo root of this panel), for example{" "}
        <code>https://pcstat.pages.dev</code>. See <code>docs/DEPLOYMENT.md</code> in the website repo, “Live preview”.
      </p>
    </div>
  );
}

function SiteFrame({ src }: { src: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);
  const state = useContentStore(useShallow((s) => ({ docs: s.docs, memberDrafts: s.memberDrafts, uploads: s.uploads })));
  const payload = useMemo(() => (WEBSITE_URL ? buildPreviewPayload(state) : null), [state]);
  const latest = useRef(payload);
  const [connected, setConnected] = useState(false);
  const [waited, setWaited] = useState(false);

  // Tell the user when the website never announces itself (it has not been set up to accept drafts).
  useEffect(() => {
    const timer = window.setTimeout(() => setWaited(true), 15000);
    return () => window.clearTimeout(timer);
  }, []);

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
      setConnected(true);
      if (latest.current) frame.current?.contentWindow?.postMessage({ type: PREVIEW_DATA, payload: latest.current }, origin);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <div className="site-preview">
      <div className="site-preview-bar">
        <strong>Live preview</strong> — the website with your unsaved changes. Browse it like a visitor; nothing here is saved.
        <a href={src} target="_blank" rel="noreferrer">Saved version ↗</a>
      </div>
      {waited && !connected && (
        <div className="site-preview-bar" role="alert">
          The website is not answering with live drafts yet. Make sure the website is deployed with this panel&apos;s address —{" "}
          <code>{typeof window === "undefined" ? "" : window.location.origin}</code> — as <code>admin</code> in its <code>database.json</code>, then re-run its
          deploy workflow. Until then the frame shows the saved version.
        </div>
      )}
      <iframe ref={frame} src={src} title="Live site preview" />
    </div>
  );
}
