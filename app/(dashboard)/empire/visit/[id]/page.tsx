import { notFound } from "next/navigation";
import { VisitView } from "@/components/empire/visit-view";

export const metadata = { title: "Visiting" };

export default async function VisitPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  return <div className="relative h-full min-h-[70vh]"><VisitView userId={id} /></div>;
}
