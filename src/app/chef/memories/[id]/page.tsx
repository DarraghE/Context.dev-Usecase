import { ChefMemoryDetail } from "@/components/ChefMemoryDetail";

export const metadata = { title: "Memory" };

export default async function ChefMemoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChefMemoryDetail id={id} />;
}
