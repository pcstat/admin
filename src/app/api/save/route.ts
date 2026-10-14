import { NextResponse } from "next/server";
import { requestHasValidSession } from "@/lib/auth";
import { isDeletablePath, isWritablePath } from "@/lib/paths";
import { ConflictError, getDataProvider, type CommitRequest } from "@/lib/provider";

export const dynamic = "force-dynamic";

const MAX_TOTAL_BASE64 = 25 * 1024 * 1024; // ~18 MB of real data per save

export async function POST(request: Request) {
  if (!(await requestHasValidSession(request))) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  let body: CommitRequest;
  try {
    body = (await request.json()) as CommitRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body?.message || !Array.isArray(body.files)) {
    return NextResponse.json({ error: "Expected { message, files }." }, { status: 400 });
  }

  const deletions = body.deletions ?? [];
  const badWrite = body.files.find((f) => typeof f?.path !== "string" || typeof f.contentsBase64 !== "string" || !isWritablePath(f.path));
  if (badWrite) return NextResponse.json({ error: `Refusing to write "${badWrite?.path}".` }, { status: 400 });
  const badDelete = deletions.find((p) => typeof p !== "string" || !isDeletablePath(p));
  if (badDelete) return NextResponse.json({ error: `Refusing to delete "${badDelete}".` }, { status: 400 });
  if (body.files.reduce((n, f) => n + f.contentsBase64.length, 0) > MAX_TOTAL_BASE64) {
    return NextResponse.json({ error: "This save is too large. Save in smaller steps (fewer photos at a time)." }, { status: 413 });
  }
  // JSON files must stay valid JSON.
  for (const f of body.files) {
    if (!f.path.endsWith(".json")) continue;
    try {
      JSON.parse(Buffer.from(f.contentsBase64, "base64").toString("utf8"));
    } catch {
      return NextResponse.json({ error: `${f.path} is not valid JSON.` }, { status: 400 });
    }
  }

  try {
    const result = await getDataProvider().commit({ message: body.message, files: body.files, deletions, baseSha: body.baseSha ?? null });
    return NextResponse.json(result);
  } catch (err) {
    const status = err instanceof ConflictError ? 409 : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status });
  }
}
