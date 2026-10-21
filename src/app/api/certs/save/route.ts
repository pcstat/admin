import { NextResponse } from "next/server";
import { requestHasValidSession } from "@/lib/auth";
import { explainRegistryError } from "@/lib/certificates/explain";
import { ConflictError, getCertificatesProvider, type CommitRequest } from "@/lib/provider";
import { isWritableCertPath } from "@/lib/certificates/paths";

export const dynamic = "force-dynamic";

const MAX_TOTAL_BASE64 = 25 * 1024 * 1024;

/**
 * Writes set files to the certificate registry in one atomic commit. Sets are only ever created or changed here —
 * an issued certificate is withdrawn by revoking it (a status in the file), never by deleting it, so deletions
 * are not accepted at all.
 */
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
  if (!body?.message || !Array.isArray(body.files) || body.files.length === 0) {
    return NextResponse.json({ error: "Expected { message, files }." }, { status: 400 });
  }
  if (body.deletions?.length) return NextResponse.json({ error: "Certificates are revoked, not deleted." }, { status: 400 });
  const bad = body.files.find((f) => typeof f?.path !== "string" || typeof f.contentsBase64 !== "string" || !isWritableCertPath(f.path));
  if (bad) return NextResponse.json({ error: `Refusing to write "${bad?.path}".` }, { status: 400 });
  if (body.files.reduce((n, f) => n + f.contentsBase64.length, 0) > MAX_TOTAL_BASE64) {
    return NextResponse.json({ error: "This save is too large." }, { status: 413 });
  }
  for (const f of body.files) {
    try {
      JSON.parse(Buffer.from(f.contentsBase64, "base64").toString("utf8"));
    } catch {
      return NextResponse.json({ error: `${f.path} is not valid JSON.` }, { status: 400 });
    }
  }
  try {
    const result = await getCertificatesProvider().commit({ message: body.message, files: body.files, baseSha: body.baseSha ?? null, skipCi: body.skipCi === true });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof ConflictError ? err.message : explainRegistryError(err) }, { status: err instanceof ConflictError ? 409 : 500 });
  }
}
