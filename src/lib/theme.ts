"use client";

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";
const EVENT = "admin-theme-change";

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}
const read = (): Theme => (document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");

/**
 * The colour theme — the same mechanism as the public website: `<html data-theme>` plus `localStorage.theme`, set before
 * first paint by layout.tsx. The sidebar switch, the mobile bar switch and the member-page mirrors all read this one value.
 */
export function useTheme(): [Theme, () => void] {
  const theme = useSyncExternalStore(subscribe, read, () => "dark" as Theme);
  const toggle = () => {
    const next: Theme = read() === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try {
      window.localStorage.setItem("theme", next);
    } catch {
      /* the choice just is not remembered */
    }
    window.dispatchEvent(new Event(EVENT));
  };
  return [theme, toggle];
}
