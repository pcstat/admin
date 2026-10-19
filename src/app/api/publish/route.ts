import { NextResponse } from "next/server";
import { requestHasValidSession } from "@/lib/auth";
import { getDataProvider } from "@/lib/provider";

export const dynamic = "force-dynamic";

/** Starts the database repo's deploy workflow (publishes commits that were saved with "[skip ci]"). */
export async function POST(request: Request) {
  if (!(await requestHasValidSession(request))) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const provider = getDataProvider();
  if (!provider.publish) {
    return NextResponse.json({ error: "Nothing to publish in local test mode — edits are written to a local folder." }, { status: 400 });
  }
  try {
    return NextResponse.json(await provider.publish());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
