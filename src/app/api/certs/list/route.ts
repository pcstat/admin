import { NextResponse } from "next/server";
import { requestHasValidSession } from "@/lib/auth";
import { explainRegistryError } from "@/lib/certificates/explain";
import { getCertificatesLocation } from "@/lib/database-config";
import { getCertificatesProvider } from "@/lib/provider";
import { SET_FILE_RE } from "@/lib/certificates/paths";

export const dynamic = "force-dynamic";

/**
 * Which set files exist, and the commit they were read at. Only two GitHub requests: the browser then reads the sets
 * one by one (/api/certs/file), so no single request needs many subrequests (Cloudflare Workers allow only a few).
 */
export async function GET(request: Request) {
  if (!(await requestHasValidSession(request))) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  try {
    const provider = getCertificatesProvider();
    const [baseSha, files] = await Promise.all([provider.getHeadSha(), provider.listFiles("sets")]);
    let publicBase = "";
    try {
      publicBase = getCertificatesLocation().publicBase;
    } catch {
      /* local mode without a configured registry address */
    }
    return NextResponse.json({ provider: provider.kind, baseSha, sets: files.filter((f) => SET_FILE_RE.test(f)), publicBase }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: explainRegistryError(err) }, { status: 500 });
  }
}
