import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MemberEditor } from "@/components/member/MemberEditor";

export default async function MemberFilePage({ params }: { params: Promise<{ id: string; kind: string }> }) {
  const { id, kind } = await params;
  if (kind !== "profile" && kind !== "cv") notFound();
  return (
    <Suspense fallback={<p className="lead">Loading…</p>}>
      <MemberEditor id={decodeURIComponent(id)} kind={kind} />
    </Suspense>
  );
}
