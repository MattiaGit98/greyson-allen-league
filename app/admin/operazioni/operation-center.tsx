"use client";

import { useMemo, useState } from "react";
import { evaluateAuctionPurchase } from "@/lib/rules/auction";
import type { RosterEntry, TeamSummary } from "@/lib/demo-data";

type Mode = "purchase" | "release" | "trade";

export function OperationCenter({ teams, rosterEntries }: { teams: TeamSummary[]; rosterEntries: RosterEntry[] }) {
  const [mode, setMode] = useState<Mode>("purchase");
  const [teamA, setTeamA] = useState(teams[0]?.code ?? "");
  const [teamB, setTeamB] = useState(teams[1]?.code ?? "");
  const [playerA, setPlayerA] = useState("");
  const [playerB, setPlayerB] = useState("");
  const [newPlayer, setNewPlayer] = useState("");
  const [price, setPrice] = useState(1);
  const activeFor = (code: string) => rosterEntries.filter((entry) => entry.teamCode === code && entry.state === "active");
  const selectedTeam = teams.find((team) => team.code === teamA) ?? teams[0];
  const purchasePreview = evaluateAuctionPurchase({
    currentCost: selectedTeam?.cost ?? 0,
    price,
    slots: { regular: selectedTeam?.players ?? 0, twoWay: 0, gLeague: 0, dpe: 0 },
    playerAlreadyOwned: rosterEntries.some((entry) => entry.state === "active" && entry.name.toLowerCase() === newPlayer.trim().toLowerCase()),
  });
  const selectedRelease = activeFor(teamA).find((entry) => entry.name === playerA);
  const selectedTradeA = activeFor(teamA).find((entry) => entry.name === playerA);
  const selectedTradeB = activeFor(teamB).find((entry) => entry.name === playerB);
  const tradeSummary = useMemo(() => ({
    teamAPlayers: activeFor(teamA).length + (selectedTradeB ? 1 : 0) - (selectedTradeA ? 1 : 0),
    teamBPlayers: activeFor(teamB).length + (selectedTradeA ? 1 : 0) - (selectedTradeB ? 1 : 0),
  }), [playerA, playerB, teamA, teamB]);

  return (
    <div className="operation-shell">
      <div className="operation-tabs">
        {([["purchase", "Acquisto"], ["release", "Taglio"], ["trade", "Scambio"]] as [Mode, string][]).map(([value, label]) => (
          <button className={mode === value ? "active" : ""} onClick={() => setMode(value)} key={value}>{label}</button>
        ))}
      </div>

      {mode === "purchase" && (
        <div className="operation-layout">
          <div className="operation-form">
            <h2>Registra un acquisto</h2>
            <label>Squadra<select value={teamA} onChange={(event) => setTeamA(event.target.value)}>{teams.map((team) => <option key={team.code}>{team.code}</option>)}</select></label>
            <label>Giocatore<input value={newPlayer} onChange={(event) => setNewPlayer(event.target.value)} placeholder="Nome completo" /></label>
            <label>Prezzo<input type="number" min="1" value={price} onChange={(event) => setPrice(Math.max(1, Number(event.target.value)))} /></label>
          </div>
          <Preview valid={purchasePreview.valid && Boolean(newPlayer.trim())} errors={purchasePreview.errors.map((issue) => issue.message)} warnings={purchasePreview.warnings.map((issue) => issue.message)}>
            <Metric label="Cap prima" value={`${selectedTeam?.cost ?? 0} CR`} />
            <Metric label="Cap dopo" value={`${purchasePreview.calculated.costAfter} CR`} />
            <Metric label="Roster dopo" value={`${(selectedTeam?.players ?? 0) + 1} giocatori`} />
          </Preview>
        </div>
      )}

      {mode === "release" && (
        <div className="operation-layout">
          <div className="operation-form">
            <h2>Taglia un giocatore</h2>
            <label>Squadra<select value={teamA} onChange={(event) => { setTeamA(event.target.value); setPlayerA(""); }}>{teams.map((team) => <option key={team.code}>{team.code}</option>)}</select></label>
            <label>Giocatore<select value={playerA} onChange={(event) => setPlayerA(event.target.value)}><option value="">Seleziona…</option>{activeFor(teamA).map((entry) => <option key={entry.name}>{entry.name}</option>)}</select></label>
            <label>Motivazione<textarea placeholder="Obbligatoria per la registrazione amministrativa" /></label>
          </div>
          <Preview valid={Boolean(selectedRelease)} errors={[]} warnings={selectedRelease ? ["Il giocatore libera lo slot ma continua a pesare sul salary cap fino alla scadenza."] : []}>
            <Metric label="Slot liberati" value={selectedRelease ? "1" : "—"} />
            <Metric label="Dead cap" value={selectedRelease ? `${selectedRelease.cost} CR` : "—"} />
            <Metric label="Scadenza" value={selectedRelease?.contract ?? "—"} />
          </Preview>
        </div>
      )}

      {mode === "trade" && (
        <div className="operation-layout">
          <div className="operation-form">
            <h2>Prepara uno scambio</h2>
            <div className="form-pair">
              <label>Squadra A<select value={teamA} onChange={(event) => { setTeamA(event.target.value); setPlayerA(""); }}>{teams.filter((team) => team.code !== teamB).map((team) => <option key={team.code}>{team.code}</option>)}</select></label>
              <label>Giocatore ceduto<select value={playerA} onChange={(event) => setPlayerA(event.target.value)}><option value="">Nessuno…</option>{activeFor(teamA).map((entry) => <option key={entry.name}>{entry.name}</option>)}</select></label>
            </div>
            <div className="form-pair">
              <label>Squadra B<select value={teamB} onChange={(event) => { setTeamB(event.target.value); setPlayerB(""); }}>{teams.filter((team) => team.code !== teamA).map((team) => <option key={team.code}>{team.code}</option>)}</select></label>
              <label>Giocatore ceduto<select value={playerB} onChange={(event) => setPlayerB(event.target.value)}><option value="">Nessuno…</option>{activeFor(teamB).map((entry) => <option key={entry.name}>{entry.name}</option>)}</select></label>
            </div>
          </div>
          <Preview valid={Boolean(selectedTradeA || selectedTradeB)} errors={[]} warnings={["In offseason i minimi di ruolo non bloccano lo scambio; saranno ricontrollati prima della stagione."]}>
            <Metric label={`${teamA} dopo`} value={`${tradeSummary.teamAPlayers} giocatori`} />
            <Metric label={`${teamB} dopo`} value={`${tradeSummary.teamBPlayers} giocatori`} />
            <Metric label="Contratti" value="Trasferiti invariati" />
          </Preview>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="preview-metric"><span>{label}</span><strong>{value}</strong></div>;
}

function Preview({ valid, errors, warnings, children }: { valid: boolean; errors: string[]; warnings: string[]; children: React.ReactNode }) {
  return (
    <aside className="operation-preview">
      <p className="eyebrow">Anteprima</p>
      <div className="preview-metrics">{children}</div>
      {errors.map((error) => <p className="validation error" key={error}>{error}</p>)}
      {warnings.map((warning) => <p className="validation warning" key={warning}>{warning}</p>)}
      <button className="button primary" type="button" disabled>{valid ? "Anteprima valida · collega Supabase" : "Completa i dati"}</button>
      <small>Il salvataggio si attiverà collegando Supabase; l’anteprima usa già le regole della lega.</small>
    </aside>
  );
}
