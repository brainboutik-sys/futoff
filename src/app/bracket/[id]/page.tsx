import { BracketView } from "@/components/BracketView";

export const dynamic = "force-dynamic";

export default async function BracketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BracketView bracketId={id} />;
}
