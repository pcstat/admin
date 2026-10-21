import { NextResponse } from "next/server";
import { requestHasValidSession } from "@/lib/auth";
import { explainRegistryError } from "@/lib/certificates/explain";
import { getCertificatesProvider } from "@/lib/provider";
import { isReadableCertPath } from "@/lib/certificates/paths";

export const dynamic = "force-dynamic";

/** Reads one file of the certificate registry: a set (sets/py26.json) or a template (templates/…). */
export async function GET(request: Request) {
  if (!(await requestHasValidSession(request))) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const path = new URL(request.url).searchParams.get("path") ?? "";
  if (!isReadableCertPath(path)) return NextResponse.json({ error: "Not a readable registry file." }, { status: 400 });
  try {
    const text = await getCertificatesProvider().readText(path);
    return NextResponse.json({ text }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: explainRegistryError(err) }, { status: 500 });
  }
}
