import { requestHasValidSession } from "@/lib/auth";
import { PHOTO_FILE_RE } from "@/lib/paths";
import { getDataProvider } from "@/lib/provider";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  svg: "image/svg+xml",
};

/** Serves photos from the local data folder (local mode only — in GitHub mode photos come from the database site). */
export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (!(await requestHasValidSession(request))) return new Response("Authentication required.", { status: 401 });
  const provider = getDataProvider();
  const { path } = await params;
  const file = `photos/${path.join("/")}`;
  if (!provider.readBinary || !PHOTO_FILE_RE.test(file)) return new Response("Not found", { status: 404 });
  const bytes = await provider.readBinary(file);
  if (!bytes) return new Response("Not found", { status: 404 });
  const ext = file.split(".").pop()!.toLowerCase();
  return new Response(bytes as BodyInit, { headers: { "Content-Type": TYPES[ext] ?? "application/octet-stream", "Cache-Control": "no-store" } });
}
