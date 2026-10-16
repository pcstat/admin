/**
 * Address of the public website, used by the sidebar's Preview button and the "Open website" link.
 *
 * Read from the `website` field of `database.json` (repo root). The default is the address of the website's
 * Cloudflare Pages project under its default name (`pcstat` → https://pcstat.pages.dev); change the field if
 * you named the project differently or use a custom domain. The `NEXT_PUBLIC_WEBSITE_URL` environment variable,
 * when set, takes precedence (handy for local runs).
 *
 * NOTE: `process.env.NEXT_PUBLIC_*` must be written out literally so Next.js can inline it into the browser bundle.
 */
import config from "../../database.json";

function clean(value: string | undefined): string {
  return (value ?? "").trim().replace(/\/+$/, "");
}

/** Website address without a trailing slash; empty string when none is configured. */
export const WEBSITE_URL: string = clean(process.env.NEXT_PUBLIC_WEBSITE_URL) || clean(config.website);
