import { NextResponse } from "next/server";
import { requestHasValidSession } from "@/lib/auth";
import { MEMBER_FILE_RE } from "@/lib/paths";
import { getDataProvider } from "@/lib/provider";

export const dynamic = "force-dynamic";

/** Reads one member file (members/<slug>/profile.json or cv.json). */
export async function GET(request: Request) {
  if (!(await requestHasValidSession(request))) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const path = new URL(request.url).searchParams.get("path") ?? "";
  if (!MEMBER_FILE_RE.test(path)) return NextResponse.json({ error: "Not an editable member file." }, { status: 400 });
  try {
    const text = await getDataProvider().readText(path);
    return NextResponse.json({ text }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
