import { OperationCenter } from "./operation-center";
import { rosterEntries, teams } from "@/lib/demo-data";

export default function OperationsPage() {
  return (
    <section className="section page-top admin-dashboard">
      <p className="eyebrow">Procedure guidate · Offseason</p>
      <h1>Nuova operazione</h1>
      <OperationCenter teams={teams} rosterEntries={rosterEntries} />
    </section>
  );
}
