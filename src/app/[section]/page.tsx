import { notFound } from "next/navigation";
import { SectionEditor } from "@/components/SectionEditor";
import { SECTIONS } from "@/lib/schemas";

export function generateStaticParams() {
  // Sections with their own screen (the certificate registry) have their own route.
  return SECTIONS.filter((s) => !s.custom).map((s) => ({ section: s.slug }));
}

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!SECTIONS.some((s) => s.slug === section && !s.custom)) notFound();
  return <SectionEditor slug={section} />;
}
