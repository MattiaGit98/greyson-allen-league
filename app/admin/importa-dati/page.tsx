import { RestoreDataPanel } from "./restore-data-panel";

export default async function ImportDataPage({
  searchParams,
}: {
  searchParams: Promise<{ restored?: string }>;
}) {
  const query = await searchParams;
  return (
    <section className="section page-top admin-settings import-data-page">
      <RestoreDataPanel restored={query.restored === "1"} />
    </section>
  );
}
