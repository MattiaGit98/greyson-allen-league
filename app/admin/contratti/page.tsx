import { PostAuctionContractForm } from "@/app/admin/operation-forms";
import { getAdminOperationContext } from "@/lib/admin-operation-data";
import { loadPostAuctionContractDrafts } from "@/lib/post-auction-contract-store";

export default async function ContractsPage({ searchParams }: { searchParams: Promise<{ error?: string; updated?: string }> }) {
  const query = await searchParams;
  const context = await getAdminOperationContext();
  const contractDrafts = await loadPostAuctionContractDrafts(context.seasonName);
  return <section className="section page-top admin-dashboard">
    {query.updated !== undefined && <p className="notice success">Bozza privata salvata: {query.updated} contratti.</p>}
    {query.error && <p className="notice error">Operazione non riuscita: {query.error}</p>}
    <PostAuctionContractForm {...context} contractDrafts={contractDrafts} />
  </section>;
}
