import { NextResponse } from "next/server";
import { requestHasValidSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MAX_BYTES = 1024 * 1024; // a profile/CV JSON is a few KB; 1 MB is generous
const TIMEOUT_MS = 10_000;

/** Hosts that must never be fetched on the panel's behalf (the Worker has no private network, but be explicit). */
function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return true; // raw IPv4 addresses
  if (h.includes(":") || h.startsWith("[")) return true; // IPv6 literals
  return false;
}

/**
 * Fetches a member-supplied JSON file (their GitHub repo or any public https link) for the panel.
 * Done on the server so it works for hosts that do not send CORS headers. Read-only; requires a session.
 */
export async function GET(request: Request) {
  if (!(await requestHasValidSession(request))) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const target = new URL(request.url).searchParams.get("url") ?? "";
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return NextResponse.json({ error: "That is not a valid URL." }, { status: 400 });
  }
  if (url.protocol !== "https:") return NextResponse.json({ error: "Only https links are allowed." }, { status: 400 });
  if (url.username || url.password) return NextResponse.json({ error: "Links with credentials are not allowed." }, { status: 400 });
  if (isBlockedHost(url.hostname)) return NextResponse.json({ error: "That host is not allowed." }, { status: 400 });

  try {
    const res = await fetch(url.href, {
      headers: { Accept: "application/json, text/plain;q=0.9, */*;q=0.1", "User-Agent": "programming-club-admin" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.status === 404) {
      return NextResponse.json(
        { error: "File not found (404). Check the repository, branch and file name — and that the repository is public." },
        { status: 404 },
      );
    }
    if (!res.ok) return NextResponse.json({ error: `The server answered ${res.status}.` }, { status: 502 });
    const finalUrl = new URL(res.url || url.href);
    if (finalUrl.protocol !== "https:" || isBlockedHost(finalUrl.hostname)) {
      return NextResponse.json({ error: "The link redirects somewhere that is not allowed." }, { status: 400 });
    }
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES) return NextResponse.json({ error: "The file is larger than 1 MB." }, { status: 413 });
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return NextResponse.json({ error: "The file is larger than 1 MB." }, { status: 413 });
    const text = new TextDecoder().decode(buf);
    try {
      JSON.parse(text);
    } catch (err) {
      return NextResponse.json({ error: `The file is not valid JSON — ${(err as Error).message}`, text }, { status: 422 });
    }
    return NextResponse.json({ text }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return NextResponse.json({ error: timedOut ? "The server took too long to answer." : "Could not reach that link." }, { status: 502 });
  }
}
