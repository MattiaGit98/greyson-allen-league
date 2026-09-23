import { PostAuctionContractForm } from "@/app/admin/operation-forms";
import { getAdminOperationContext } from "@/lib/admin-operation-data";
import { operationWindows } from "@/lib/league-moments";
import { loadPostAuctionContractDrafts } from "@/lib/post-auction-contract-store";

export default async function ContractsPage({ searchParams }: { searchParams: Promise<{ error?: string; updated?: string }> }) {
  const query = await searchParams;
  const context = await getAdminOperationContext();
  const contractAssignmentOpen = operationWindows.contractAssignment(context.leagueMoment);
  const contractDrafts = contractAssignmentOpen
    ? await loadPostAuctionContractDrafts(context.seasonName)
    : [];
  return <section className="section page-top admin-dashboard">
    {query.updated !== undefined && <p className="notice success">Bozza privata salvata: {query.updated} contratti.</p>}
    {query.error && <p className="notice error">Operazione non riuscita: {query.error}</p>}
    {contractAssignmentOpen
      ? <PostAuctionContractForm {...context} contractDrafts={contractDrafts} />
      : <p className="notice"><strong>Pannello assegnazione contratti chiuso.</strong> È disponibile dal Termine asta fino alla consegna dei contratti.</p>}
  </section>;
}
