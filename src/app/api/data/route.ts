import { NextResponse } from "next/server";
import { requestHasValidSession } from "@/lib/auth";
import { resolveImageBase } from "@/lib/database-config";
import { getDataProvider } from "@/lib/provider";
import { DOC_FILES, type DataResponse, type DatabaseIndex } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await requestHasValidSession(request))) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  try {
    const provider = getDataProvider();
    const baseSha = await provider.getHeadSha();

    const indexText = await provider.readText("database.json");
    if (!indexText) throw new Error("database.json was not found in the database.");
    const index = JSON.parse(indexText) as DatabaseIndex;

    const entries = await Promise.all(
      DOC_FILES.map(async (file) => {
        const text = await provider.readText(file);
        if (text === null) throw new Error(`${file} was not found in the database.`);
        return [file, JSON.parse(text)] as const;
      }),
    );

    const body: DataResponse = {
      provider: provider.kind,
      // Local mode serves photos itself (/api/photo); GitHub mode previews them from the published database site.
      imageBase: provider.kind === "github" ? resolveImageBase(index.imageBase) : index.imageBase,
      baseSha,
      docs: Object.fromEntries(entries) as DataResponse["docs"],
      memberFiles: await provider.listFiles("members"),
    };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
