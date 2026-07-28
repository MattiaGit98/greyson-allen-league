import { OperationCenter } from "./operation-center";
import { rosterEntries, teams } from "@/lib/demo-data";

export default function OperationsPage() {
  return (
    <section className="section page-top admin-dashboard">
      <p className="eyebrow">Procedure guidate · Offseason</p>
      <h1>Nuova operazione</h1>
      <p className="lede">Prima di registrare qualsiasi movimento, controlla proprietà, cap, slot ed effetti contrattuali.</p>
      <OperationCenter teams={teams} rosterEntries={rosterEntries} />
    </section>
  );
}
