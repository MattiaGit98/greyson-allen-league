import { PostAuctionContractForm } from "@/app/admin/operation-forms";
import { getAdminOperationContext } from "@/lib/admin-operation-data";

export default async function ContractsPage({ searchParams }: { searchParams: Promise<{ error?: string; updated?: string }> }) {
  const query = await searchParams;
  const context = await getAdminOperationContext();
  return <section className="section page-top admin-dashboard">
    {query.updated && <p className="notice success">Contratti assegnati: {query.updated}.</p>}
    {query.error && <p className="notice error">Operazione non riuscita: {query.error}</p>}
    <PostAuctionContractForm {...context} />
  </section>;
}
