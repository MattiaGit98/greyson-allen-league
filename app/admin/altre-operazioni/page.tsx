import { getAdminOperationContext } from "@/lib/admin-operation-data";
import { OtherOperationsPanel } from "./other-operations-panel";

export default async function OtherOperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; updated?: string }>;
}) {
  const [query, context] = await Promise.all([searchParams, getAdminOperationContext()]);
  return (
    <section className="section page-top admin-dashboard other-operations-page">
      {query.updated && <p className="notice success">{query.updated}</p>}
      {query.error && <p className="notice error">Operazione non riuscita: {query.error}</p>}
      <OtherOperationsPanel {...context} />
    </section>
  );
}
