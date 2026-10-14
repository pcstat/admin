"use client";

import { usePathname } from "next/navigation";
import type { ComponentType, ReactNode } from "react";

/** The login page is shown bare; every other page gets the sidebar and save bar. */
export function LoginAwareShell({ shell: Shell, children }: { shell: ComponentType<{ children: ReactNode }>; children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/login") return <>{children}</>;
  return <Shell>{children}</Shell>;
}
