import { PlayerExplorer } from "./player-explorer";
import { qualifyingOfferRights, rosterEntries, teams } from "@/lib/demo-data";

export default function PlayersPage() {
  const rows = rosterEntries.map((entry) => ({
    ...entry,
    teamName: teams.find((team) => team.code === entry.teamCode)?.name ?? entry.teamCode,
    hasFutureQualifyingRight: qualifyingOfferRights.some((right) => right.playerName === entry.name),
  }));
  return (
    <section className="section page-top">
      <p className="eyebrow">Anagrafica contrattuale</p>
      <h1>Giocatori</h1>
      <PlayerExplorer rows={rows} />
    </section>
  );
}
