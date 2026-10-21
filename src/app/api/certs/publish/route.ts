import { NextResponse } from "next/server";
import { requestHasValidSession } from "@/lib/auth";
import { explainRegistryError } from "@/lib/certificates/explain";
import { getCertificatesProvider } from "@/lib/provider";

export const dynamic = "force-dynamic";

/** Starts the certificate registry's deploy workflow (publishes commits that were saved with "[skip ci]"). */
export async function POST(request: Request) {
  if (!(await requestHasValidSession(request))) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const provider = getCertificatesProvider();
  if (!provider.publish) return NextResponse.json({ error: "Nothing to publish in local test mode." }, { status: 400 });
  try {
    return NextResponse.json(await provider.publish());
  } catch (err) {
    return NextResponse.json({ error: explainRegistryError(err) }, { status: 502 });
  }
}
