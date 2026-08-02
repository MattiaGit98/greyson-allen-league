"use client";

import { useEffect, useMemo, useState } from "react";
import { nbaTeams } from "@/data/nba-teams";
import { evaluateFreeAgentSigning } from "@/lib/rules/free-agent";
import { countRosterRoles } from "@/lib/rules/roster";
import { seasonEndYear } from "@/lib/season-time";
import { signFreeAgent } from "./actions";
import { CapForceControl } from "@/app/admin/cap-force-control";
import { isCapIssueCode } from "@/lib/cap-override";

type Slot = "regular" | "two_way" | "g_league" | "dpe";
type PlayerOption = {
  name: string;
  role: "G" | "A" | "C" | "X";
  realTeam: string;
  rookie: boolean;
  under23: boolean;
  listOrder: number;
  rosterTeamCode: string | null;
  qualifyingTeamCode: string | null;
  cutTeamCodes: string[];
};
type TeamOption = {
  code: string;
  name: string;
  currentCost: number;
  rosterPlayers: {
    name: string;
    role: "G" | "A" | "C" | null;
    slot: Slot;
    cost: number;
    contract: string;
  }[];
};

export function FreeAgentPanel({
  phase,
  seasonName,
  tradeDeadlinePassed,
  signAndTradeOpen,
  listPublished,
  teams,
  players,
}: {
  phase: string;
  seasonName: string;
  tradeDeadlinePassed: boolean;
  signAndTradeOpen: boolean;
  listPublished: boolean;
  teams: TeamOption[];
  players: PlayerOption[];
}) {
  const [query, setQuery] = useState("");
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [outsideListOpen, setOutsideListOpen] = useState(false);
  const freeAgents = useMemo(() => players.filter((player) => (
    !player.rosterTeamCode
    && !player.qualifyingTeamCode
    && player.name.toLocaleLowerCase("it-IT").includes(query.trim().toLocaleLowerCase("it-IT"))
  )), [players, query]);
  const selectedPlayer = players.find((player) => player.name === selectedName) ?? null;

  useEffect(() => {
    if (!selectedPlayer && !outsideListOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedName(null);
        setOutsideListOpen(false);
      }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [selectedPlayer, outsideListOpen]);

  return (
    <>
      <div className="free-agent-panel-toolbar">
        <label className="auction-search search-field">
          <span>Cerca</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome del giocatore…" />
        </label>
        <button className="button secondary" type="button" disabled={!listPublished} onClick={() => setOutsideListOpen(true)}>
          + Giocatore fuori listone
        </button>
      </div>

      <div className="auction-player-list free-agent-player-list">
        <div className="auction-player-head">
          <span>#</span><span>Giocatore</span><span>Ruolo</span><span>Squadra reale</span><span>Stato</span><span></span>
        </div>
        {freeAgents.map((player) => (
          <article className={`auction-player-row ${player.rookie ? "is-rookie" : ""} ${player.under23 ? "is-under23" : ""}`} key={player.listOrder}>
            <span className="player-order">{player.listOrder}</span>
            <span className="player-identity">
              <strong className="player-name">{player.name}</strong>
              <span className="auction-player-subline">
                {player.realTeam && <small>{player.realTeam}</small>}
                {player.rookie && <i className="player-flag player-flag-rookie">Rookie</i>}
                {player.under23 && <i className="player-flag player-flag-u23">U23</i>}
              </span>
            </span>
            <span><i className={`mini-role mini-role-${player.role.toLowerCase()}`}>{player.role}</i></span>
            <strong className="real-team">{player.realTeam || "—"}</strong>
            <span className="player-status player-status-highlight"><strong>FA</strong></span>
            <button className="auction-row-action bid" type="button" disabled={!listPublished} onClick={() => setSelectedName(player.name)}>Firma</button>
          </article>
        ))}
        {!freeAgents.length && <div className="data-empty">{listPublished ? "Nessun free agent trovato" : "Listone non ancora pubblicato"}</div>}
      </div>

      {(selectedPlayer || outsideListOpen) && (
        <div className="auction-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            setSelectedName(null);
            setOutsideListOpen(false);
          }
        }}>
          <FreeAgentDialog
            key={selectedPlayer?.name ?? "outside-list"}
            player={selectedPlayer}
            allPlayers={players}
            teams={teams}
            phase={phase}
            seasonName={seasonName}
            tradeDeadlinePassed={tradeDeadlinePassed}
            signAndTradeOpen={signAndTradeOpen}
            outsideList={outsideListOpen}
            onClose={() => {
              setSelectedName(null);
              setOutsideListOpen(false);
            }}
          />
        </div>
      )}
    </>
  );
}

function FreeAgentDialog({
  player,
  allPlayers,
  teams,
  phase,
  seasonName,
  tradeDeadlinePassed,
  signAndTradeOpen,
  outsideList,
  onClose,
}: {
  player: PlayerOption | null;
  allPlayers: PlayerOption[];
  teams: TeamOption[];
  phase: string;
  seasonName: string;
  tradeDeadlinePassed: boolean;
  signAndTradeOpen: boolean;
  outsideList: boolean;
  onClose: () => void;
}) {
  const [teamCode, setTeamCode] = useState(teams[0]?.code ?? "");
  const [price, setPrice] = useState(1);
  const [destination, setDestination] = useState<"regular" | "two_way">("regular");
  const [cutPlayerName, setCutPlayerName] = useState("");
  const [outsideName, setOutsideName] = useState("");
  const [outsideRole, setOutsideRole] = useState<"G" | "A" | "C" | "X" | "">("");
  const [outsideRealTeam, setOutsideRealTeam] = useState("");
  const [forceCap, setForceCap] = useState(false);
  const [standingConfirmed, setStandingConfirmed] = useState(false);
  const team = teams.find((item) => item.code === teamCode) ?? teams[0];
  const cuttablePlayers = (team?.rosterPlayers ?? []).filter((item) => item.slot === destination);
  const cutPlayer = cuttablePlayers.find((item) => item.name === cutPlayerName);
  const customReady = outsideName.trim() && outsideRole && outsideRealTeam;
  const selectedRole: "G" | "A" | "C" | null = player
    ? player.role === "X" ? null : player.role
    : outsideRole === "G" || outsideRole === "A" || outsideRole === "C" ? outsideRole : null;
  const slots = {
    regular: team?.rosterPlayers.filter((item) => item.slot === "regular").length ?? 0,
    twoWay: team?.rosterPlayers.filter((item) => item.slot === "two_way").length ?? 0,
    gLeague: team?.rosterPlayers.filter((item) => item.slot === "g_league").length ?? 0,
    dpe: team?.rosterPlayers.filter((item) => item.slot === "dpe").length ?? 0,
  };
  const roles = countRosterRoles(team?.rosterPlayers ?? []);
  const outsideDuplicate = outsideList && allPlayers.some((item) => normalizeName(item.name) === normalizeName(outsideName));
  const preview = evaluateFreeAgentSigning({
    phase,
    currentCost: team?.currentCost ?? 0,
    price,
    destination,
    slots,
    playerSelected: outsideList ? Boolean(customReady) : Boolean(player),
    playerAlreadyOwned: Boolean(player?.rosterTeamCode),
    qualifyingOfferActive: Boolean(player?.qualifyingTeamCode),
    cutBySigningTeam: Boolean(player?.cutTeamCodes.includes(teamCode)),
    roles,
    playerRole: selectedRole,
    cutRole: cutPlayer?.role ?? null,
    cutSlot: cutPlayer?.slot ?? null,
  });
  const expiry = String(seasonEndYear(seasonName) ?? "").slice(-2);
  const contract = tradeDeadlinePassed ? expiry : `${expiry} + Q.O.`;
  const slotBefore = destination === "regular" ? slots.regular : slots.twoWay;
  const slotAfter = destination === "regular" ? preview.calculated.slotsAfter.regular : preview.calculated.slotsAfter.twoWay;
  const slotLimit = destination === "regular" ? 15 : 2;
  const capWarnings = preview.warnings.filter((warning) => isCapIssueCode(warning.code));
  const otherWarnings = preview.warnings.filter((warning) => !isCapIssueCode(warning.code));
  const signAndTradeErrors = preview.errors.filter((error) => !error.code.startsWith("SLOT_"));
  const temporarySlotErrors = preview.errors.filter((error) => error.code.startsWith("SLOT_"));
  const standingConfirmationRequired = tradeDeadlinePassed && price > 1;
  const standingConfirmationMissing = standingConfirmationRequired && !standingConfirmed;

  function openSignAndTrade() {
    const params = new URLSearchParams({
      sign_kind: "free_agent",
      sign_source: outsideList ? "outside" : "list",
      sign_player: outsideList ? outsideName.trim() : player?.name ?? "",
      sign_role: outsideList ? outsideRole : "",
      sign_real_team: outsideList ? outsideRealTeam : "",
      sign_team: teamCode,
      sign_price: String(price),
      sign_slot: destination,
    });
    window.location.assign(`/admin/scambi?${params.toString()}`);
  }

  return (
    <form action={signFreeAgent} className="auction-modal" role="dialog" aria-modal="true" aria-label={`Firma ${(player?.name ?? outsideName) || "giocatore fuori listone"}`}>
      <input type="hidden" name="player_source" value={outsideList ? "outside" : "list"} />
      <input type="hidden" name="player_name" value={outsideList ? outsideName.trim() : player?.name ?? ""} />
      <input type="hidden" name="player_role" value={outsideList ? outsideRole : ""} />
      <input type="hidden" name="real_team" value={outsideList ? outsideRealTeam : ""} />
      <input type="hidden" name="team_code" value={teamCode} />
      <input type="hidden" name="price" value={price} />
      <input type="hidden" name="destination" value={destination} />
      <input type="hidden" name="cut_player_name" value={cutPlayerName} />
      <input type="hidden" name="force_cap" value={String(forceCap)} />
      <input type="hidden" name="standing_confirmed" value={String(standingConfirmed)} />

      <div className="auction-modal-header">
        <div>
          <span>Firma free agent</span>
          <strong>{(player?.name ?? outsideName.trim()) || "Giocatore fuori listone"}</strong>
          <small>{player ? `${player.role} · ${player.realTeam || "Squadra reale non indicata"}` : "Inserimento contestuale nel listone"}</small>
        </div>
        <button type="button" onClick={onClose} aria-label="Chiudi">×</button>
      </div>

      <div className="auction-modal-body">
        <div className={`auction-modal-fields ${outsideList ? "free-agent-outside-fields" : ""}`}>
          {outsideList && (
            <>
              <Field label="Nome giocatore"><input type="text" maxLength={120} value={outsideName} onChange={(event) => setOutsideName(event.target.value)} /></Field>
              <Field label="Ruolo"><select value={outsideRole} onChange={(event) => setOutsideRole(event.target.value as typeof outsideRole)}><option value="">Seleziona</option><option value="G">Guardia</option><option value="A">Ala</option><option value="C">Centro</option><option value="X">Senza ruolo Dunkest</option></select></Field>
              <Field label="Squadra NBA"><select value={outsideRealTeam} onChange={(event) => setOutsideRealTeam(event.target.value)}><option value="">Seleziona</option>{nbaTeams.map((item) => <option value={item.code} key={item.code}>{item.code} · {item.name}</option>)}</select></Field>
            </>
          )}
          <Field label="Squadra">
            <select value={teamCode} onChange={(event) => { setTeamCode(event.target.value); setCutPlayerName(""); setForceCap(false); setStandingConfirmed(false); }}>
              {teams.map((item) => <option value={item.code} key={item.code}>{formatTeamName(item.name)}</option>)}
            </select>
          </Field>
          <Field label="Prezzo"><input type="number" min="1" step="1" inputMode="numeric" value={price} onChange={(event) => { const value = Number(event.target.value); setPrice(value); setForceCap(false); setStandingConfirmed(false); if (value > 10) { setDestination("regular"); setCutPlayerName(""); } }} /></Field>
          <Field label="Slot">
            <select value={destination} onChange={(event) => { setDestination(event.target.value as typeof destination); setCutPlayerName(""); setForceCap(false); }}>
              <option value="regular">Roster</option>
              <option value="two_way" disabled={price > 10}>Two-way</option>
            </select>
          </Field>
          <Field label="Giocatore da tagliare">
            <select value={cutPlayerName} onChange={(event) => setCutPlayerName(event.target.value)}>
              <option value="">Nessun taglio</option>
              {cuttablePlayers.map((item) => <option value={item.name} key={item.name}>{item.name} · {item.cost} · {item.contract}</option>)}
            </select>
          </Field>
        </div>

        <div className="auction-modal-summary free-agent-modal-summary">
          <Metric label="Spazio libero" value={`${preview.calculated.spaceBefore} → ${preview.calculated.spaceAfter}`} />
          <Metric label={destination === "regular" ? "Slot roster" : "Slot Two-way"} value={`${slotBefore}/${slotLimit} → ${slotAfter}/${slotLimit}`} />
          <Metric label="Ruoli" value={`${formatRoles(roles)} → ${formatRoles(preview.calculated.rolesAfter)}`} />
          <Metric label="Contratto" value={contract} />
        </div>
        {cutPlayer && <p className="auction-context-cut"><span>Taglio contestuale</span><strong>{cutPlayer.name}</strong></p>}
        {outsideDuplicate && <p className="validation error">Il giocatore è già nel listone: selezionalo dall’elenco.</p>}
        {tradeDeadlinePassed && (
          <p className="validation warning free-agent-standing-reminder">Dopo la trade deadline, verifica manualmente la classifica: le ultime tre squadre possono acquistare free agent soltanto per 1 credito.</p>
        )}
        {standingConfirmationRequired && (
          <label className="operation-check free-agent-standing-check">
            <input type="checkbox" checked={standingConfirmed} onChange={(event) => setStandingConfirmed(event.target.checked)} />
            Ho verificato che la squadra non occupi una delle ultime tre posizioni
          </label>
        )}
        {preview.errors.map((error) => <p className="validation error" key={error.code}>{error.message}</p>)}
        {signAndTradeOpen && temporarySlotErrors.length > 0 && signAndTradeErrors.length === 0 && (
          <p className="validation warning">Con Firma e scambia puoi proseguire, ma lo slot deve essere liberato nella situazione finale.</p>
        )}
        {otherWarnings.map((warning) => <p className="validation warning" key={warning.code}>{warning.message}</p>)}
        <CapForceControl warnings={capWarnings.map((warning) => warning.message)} checked={forceCap} onChange={setForceCap} />
        {preview.valid && !standingConfirmationMissing && !outsideDuplicate && !preview.warnings.length && <p className="validation success">Controlli regolamentari superati.</p>}
      </div>

      <div className="auction-modal-actions">
        <button className="button secondary" type="button" onClick={onClose}>Annulla</button>
        <button
          className="button secondary sign-trade-action"
          type="button"
          onClick={openSignAndTrade}
          disabled={!signAndTradeOpen || signAndTradeErrors.length > 0 || outsideDuplicate || !team}
        >
          Firma e scambia
        </button>
        <button className="button primary" type="submit" disabled={!preview.valid || standingConfirmationMissing || outsideDuplicate || !team || (capWarnings.length > 0 && !forceCap)}>Registra firma</button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="auction-field"><span>{label}</span>{children}</label>;
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("it-IT");
}

function formatTeamName(name: string) {
  return name.toLocaleLowerCase("it-IT").replace(/(^|[\s'-])\p{L}/gu, (letter) => letter.toLocaleUpperCase("it-IT"));
}

function formatRoles(roles: { G: number; A: number; C: number }) {
  return `${roles.G} G · ${roles.A} A · ${roles.C} C`;
}
