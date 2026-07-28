import { redirect } from "next/navigation";

export default async function LegacyTeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/squadre?team=${slug}`);
}
