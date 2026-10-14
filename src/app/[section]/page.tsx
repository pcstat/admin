import { notFound } from "next/navigation";
import { SectionEditor } from "@/components/SectionEditor";
import { SECTIONS } from "@/lib/schemas";

export function generateStaticParams() {
  return SECTIONS.map((s) => ({ section: s.slug }));
}

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!SECTIONS.some((s) => s.slug === section)) notFound();
  return <SectionEditor slug={section} />;
}
