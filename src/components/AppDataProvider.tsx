"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useContentStore } from "@/store/content-store";
import type { DataResponse } from "@/lib/types";

/** Loads the database once after login and feeds the store. The login page renders without it. */
export function AppDataProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const status = useContentStore((s) => s.status);
  const loadError = useContentStore((s) => s.loadError);
  const isLogin = pathname === "/login";

  useEffect(() => {
    if (isLogin || useContentStore.getState().status === "ready") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/data", { cache: "no-store" });
        if (res.status === 401) {
          window.location.replace(`/login?next=${encodeURIComponent(pathname)}`);
          return;
        }
        const data = (await res.json()) as DataResponse & { error?: string };
        if (!res.ok) throw new Error(data.error || `Could not load the database (${res.status}).`);
        if (!cancelled) useContentStore.getState().init(data);
      } catch (err) {
        if (!cancelled) useContentStore.getState().fail(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLogin, pathname]);

  if (isLogin) return <>{children}</>;
  if (status === "error") {
    return (
      <div className="state-screen">
        <h1>Could not load the database</h1>
        <p className="error-text">{loadError}</p>
        <button className="btn" onClick={() => window.location.reload()}>Try again</button>
      </div>
    );
  }
  if (status === "loading") return <div className="state-screen"><p>Loading the database…</p></div>;
  return <>{children}</>;
}
