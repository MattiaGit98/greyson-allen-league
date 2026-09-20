"use client";

import { useState, type ReactNode } from "react";
import { allowedPostAuctionContracts, auctionAcquisitionLabel, isPostAuctionContractAssignmentCandidate, type PostAuctionContractKind } from "@/lib/auction-management";
import { assignPostAuctionContracts } from "@/app/admin/contratti/actions";
import { moveRosterSlot } from "@/app/admin/slot/actions";
import { exercisePlayoffTeamOptions, saveTeamOptionDecisions } from "@/app/admin/team-option/actions";
import type { AdminRosterPlayer, AdminRosterTeam } from "@/lib/admin-operation-data";
import { operationWindows, type LeagueMoment } from "@/lib/league-moments";
import { CapBlocker } from "@/app/admin/cap-force-control";
import { salaryCapWarningsForSpaces } from "@/lib/cap-override";
import { legalSlotDestinations, slotEligibilityErrors, slotMoveTimingErrors } from "@/lib/slot-eligibility";
import { destinationAfterTeamOptionExercise } from "@/lib/team-option-contract";
import type { PostAuctionContractDraft } from "@/lib/post-auction-contracts";

type OperationProps = {
  phase: string;
  seasonName: string;
  seasonEndYear: number;
  teamOptionsResolved: boolean;
  tradeDeadlinePassed: boolean;
  leagueMoment: LeagueMoment;
  teams: AdminRosterTeam[];
};

const slotLimits = { regular: 15, two_way: 2, g_league: 3, dpe: 1 } as const;
type Slot = keyof typeof slotLimits;

function formatTeamName(name: string) {
  return name
    .toLocaleLowerCase("it-IT")
    .replace(/(^|[\s'-])\p{L}/gu, (letter) => letter.toLocaleUpperCase("it-IT"));
}

function formatSpace(value: number) {
  return String(value);
}

function seasonNameAt(name: string, distance: number) {
  const start = Number(name.slice(0, 4)) + distance;
  return `${start}/${String((start + 1) % 100).padStart(2, "0")}`;
}

function slotLabel(slot: Slot) {
  if (slot === "two_way") return "Two-way";
  if (slot === "g_league") return "G-League";
  if (slot === "dpe") return "DPE";
  return "Roster";
}

function formatSlots(slots: Record<Slot, number>) {
  return `${slots.regular}/15 · ${slots.two_way}/2 · ${slots.g_league}/3 · ${slots.dpe}/1`;
}

function formatRoles(roles: Record<"G" | "A" | "C", number>) {
  return `${roles.G} G · ${roles.A} A · ${roles.C} C`;
}

function slotCounts(team?: AdminRosterTeam) {
  return (team?.players ?? [])
    .filter((player) => player.state === "active")
    .reduce<Record<Slot, number>>((counts, player) => {
      counts[player.slot] += 1;
      return counts;
    }, { regular: 0, two_way: 0, g_league: 0, dpe: 0 });
}

function roleCounts(team?: AdminRosterTeam) {
  return (team?.players ?? [])
    .filter((player) => player.state === "active" && player.slot !== "dpe")
    .reduce((counts, player) => {
      if (player.role) counts[player.role] += 1;
      return counts;
    }, { G: 0, A: 0, C: 0 });
}


function Metric({ label, value }: { label: string; value: ReactNode }) {
  return <div className="preview-metric"><span>{label}</span><strong>{value}</strong></div>;
}


function TeamSelect({ teams, value, onChange }: {
  teams: AdminRosterTeam[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {teams.map((team) => (
        <option value={team.code} key={team.code}>{formatTeamName(team.name)}</option>
      ))}
    </select>
  );
}


function Validation({ errors, warnings = [] }: { errors: string[]; warnings?: string[] }) {
  return (
    <div className="admin-operation-validation">
      {errors.map((error) => <p className="validation error" key={error}>{error}</p>)}
      {warnings.map((warning) => <p className="validation warning" key={warning}>{warning}</p>)}
    </div>
  );
}

export function TeamOptionForm(props: OperationProps) {
  const [teamCode, setTeamCode] = useState(props.teams[0]?.code ?? "");
  const [decisions, setDecisions] = useState<Record<string, "exercise" | "decline">>({});
  const [gLeagueDestinations, setGLeagueDestinations] = useState<Record<string, "two_way" | "regular">>({});
  const team = props.teams.find((item) => item.code === teamCode) ?? props.teams[0];
  const players = (team?.players ?? []).filter((player) => player.state === "active" && player.isTeamOption);
  const before = slotCounts(team);
  const after = { ...before };
  const selectedPlayers = players.filter((player) => decisions[player.id]);
  const exercisedPlayers = players.filter((player) => decisions[player.id] === "exercise");
  const rolesBefore = roleCounts(team);
  const rolesAfter = { ...rolesBefore };
  const destinationFor = (player: AdminRosterPlayer): Slot => {
    return destinationAfterTeamOptionExercise(player.slot, gLeagueDestinations[player.id] ?? "two_way");
  };
  players.forEach((player) => {
    const decision = decisions[player.id];
    if (decision === "decline") {
      after[player.slot] -= 1;
      if (player.slot !== "dpe" && player.role) rolesAfter[player.role] -= 1;
    }
    if (decision === "exercise") {
      const destination = destinationFor(player);
      if (destination !== player.slot) {
        after[player.slot] -= 1;
        after[destination] += 1;
      }
    }
  });
  const exercisedCost = exercisedPlayers.reduce((total, player) => total + player.cost, 0);
  const doubledCost = exercisedCost * 2;
  const currentSpaceAfter = (team?.spaceBeforeOptions ?? 0) - exercisedCost;
  const nextSpaceAfter = (team?.nextSpace ?? 0) - doubledCost;
  const followingSpaceAfter = team?.followingSpace ?? 0;
  const nextSeasonName = seasonNameAt(props.seasonName, 1);
  const followingSeasonName = seasonNameAt(props.seasonName, 2);
  const errors = [
    ...(!operationWindows.teamOption(props.leagueMoment)
      ? ["Le T.O. si possono risolvere soltanto in Offseason — prima delle T.O."]
      : []),
    ...(after.regular > slotLimits.regular ? ["Gli esercizi selezionati superano i 15 slot roster."] : []),
    ...(after.two_way > slotLimits.two_way ? ["Gli esercizi selezionati superano i 2 slot Two-way."] : []),
    ...(after.g_league > slotLimits.g_league ? ["Le decisioni selezionate superano i 3 slot G-League."] : []),
  ];
  const capWarnings = [
    ...(currentSpaceAfter < 0 ? [`Gli esercizi portano il cap libero ${props.seasonName} a ${currentSpaceAfter}.`] : []),
    ...(nextSpaceAfter < 0 ? [`Il raddoppio porta il cap libero ${nextSeasonName} a ${nextSpaceAfter}.`] : []),
    ...(followingSpaceAfter < 0 ? [`Il cap libero ${followingSeasonName} è ${followingSpaceAfter}.`] : []),
  ];

  function setDecision(playerId: string, decision: "exercise" | "decline", checked: boolean) {
    setDecisions((current) => {
      if (!checked) {
        const next = { ...current };
        delete next[playerId];
        return next;
      }
      return { ...current, [playerId]: decision };
    });
  }
  const serializedDecisions = selectedPlayers.map((player) => ({
    playerName: player.name,
    decision: decisions[player.id],
    destination: destinationFor(player) === "two_way" ? "two_way" : "regular",
  }));

  return (
    <form action={saveTeamOptionDecisions} className="team-option-workspace">
      <input type="hidden" name="team_code" value={teamCode} />
      <input type="hidden" name="decisions_json" value={JSON.stringify(serializedDecisions)} />
      <div className="team-option-editor">
        <label className="admin-team-select team-option-team-select">
          <span>Squadra</span>
          <TeamSelect teams={props.teams} value={teamCode} onChange={(value) => { setTeamCode(value); }} />
        </label>
        <div className="team-option-list">
          <div className="team-option-list-head"><span>Giocatore</span><span>Decisione</span><span>Destinazione</span></div>
          {players.map((player) => {
            const decision = decisions[player.id];
            return (
              <div className="team-option-row" key={player.id}>
                <div className="team-option-player">
                  <strong>{player.name}</strong>
                  <span>{player.role ?? "X"} · {slotLabel(player.slot)} · {player.cost}</span>
                </div>
                <div className="team-option-decisions">
                  <label className={decision === "exercise" ? "selected exercise" : ""}>
                    <input type="checkbox" checked={decision === "exercise"} onChange={(event) => setDecision(player.id, "exercise", event.target.checked)} />
                    Esercita
                  </label>
                  <label className={decision === "decline" ? "selected decline" : ""}>
                    <input type="checkbox" checked={decision === "decline"} onChange={(event) => setDecision(player.id, "decline", event.target.checked)} />
                    Lascia andare
                  </label>
                </div>
                <div className="team-option-destination">
                  {decision === "exercise" && player.slot === "g_league"
                    ? <select value={gLeagueDestinations[player.id] ?? "two_way"} onChange={(event) => { setGLeagueDestinations((current) => ({ ...current, [player.id]: event.target.value as "two_way" | "regular" })); }}><option value="two_way">Two-way</option><option value="regular">Roster</option></select>
                    : decision === "exercise" && player.slot === "two_way"
                      ? <span>Roster ↑</span>
                      : decision === "exercise" ? <span>{slotLabel(player.slot)}</span> : <span>—</span>}
                </div>
              </div>
            );
          })}
          {!players.length && <p className="team-option-empty">Nessuna team option per questa squadra.</p>}
        </div>
        <button className="button primary team-option-save" type="submit" disabled={Boolean(errors.length) || !selectedPlayers.length || capWarnings.length > 0}>
          Salva decisioni{selectedPlayers.length ? ` (${selectedPlayers.length})` : ""}
        </button>
      </div>

      <aside className="team-option-recap">
        {selectedPlayers.length > 0 && <>
          <div className="auction-modal-summary cap-three-years">
            <Metric label={`Cap libero ${props.seasonName}`} value={`${formatSpace(team?.spaceBeforeOptions ?? 0)} → ${formatSpace(currentSpaceAfter)}`} />
            <Metric label={`Cap libero ${nextSeasonName}`} value={`${formatSpace(team?.nextSpace ?? 0)} → ${formatSpace(nextSpaceAfter)}`} />
            <Metric label={`Cap libero ${followingSeasonName}`} value={`${formatSpace(team?.followingSpace ?? 0)} → ${formatSpace(followingSpaceAfter)}`} />
          </div>
          <div className="auction-modal-summary operation-comparison-summary">
            <Metric label="Slot" value={`${formatSlots(before)} → ${formatSlots(after)}`} />
            <Metric label="Ruoli" value={`${formatRoles(rolesBefore)} → ${formatRoles(rolesAfter)}`} />
          </div>
        </>}
        <Validation errors={errors} />
        <CapBlocker warnings={capWarnings} />
      </aside>
    </form>
  );
}

export function PlayoffTeamOptionForm(props: OperationProps) {
  const [teamCode, setTeamCode] = useState(props.teams[0]?.code ?? "");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const team = props.teams.find((item) => item.code === teamCode) ?? props.teams[0];
  const players = (team?.players ?? []).filter((player) => (
    player.state === "active" && player.slot === "g_league" && player.isTeamOption
  ));
  const selectedPlayers = players.filter((player) => selected[player.id]);
  const before = slotCounts(team);
  const rolesBefore = roleCounts(team);
  const exercisedCost = selectedPlayers.reduce((total, player) => total + player.cost, 0);
  const nextSeasonName = seasonNameAt(props.seasonName, 1);
  const followingSeasonName = seasonNameAt(props.seasonName, 2);
  const currentSpaceAfter = team?.space ?? 0;
  const nextSpaceAfter = (team?.nextSpace ?? 0) - exercisedCost;
  const followingSpaceAfter = (team?.followingSpace ?? 0) - exercisedCost * 2;
  const errors = !operationWindows.playoffTeamOption(props.leagueMoment)
    ? ["L'esercizio anticipato per utilizzo nei playoff è disponibile dopo il termine della free agency."]
    : [];
  const capWarnings = [
    ...(currentSpaceAfter < 0 ? [`Il cap libero ${props.seasonName} è ${currentSpaceAfter}.`] : []),
    ...(nextSpaceAfter < 0 ? [`Gli esercizi portano il cap libero ${nextSeasonName} a ${nextSpaceAfter}.`] : []),
    ...(followingSpaceAfter < 0 ? [`Il raddoppio porta il cap libero ${followingSeasonName} a ${followingSpaceAfter}.`] : []),
  ];

  return (
    <form action={exercisePlayoffTeamOptions} className="team-option-workspace playoff-team-option-workspace">
      <input type="hidden" name="team_code" value={teamCode} />
      <input type="hidden" name="player_names_json" value={JSON.stringify(selectedPlayers.map((player) => player.name))} />
      <div className="team-option-editor">
        <div className="team-option-mode playoff">
          <span>Esercizio anticipato</span>
          <strong>Utilizzo in una gara dei playoff</strong>
        </div>
        <label className="admin-team-select team-option-team-select">
          <span>Squadra</span>
          <TeamSelect teams={props.teams} value={teamCode} onChange={(value) => { setTeamCode(value); setSelected({}); }} />
        </label>
        <div className="team-option-list">
          <div className="team-option-list-head"><span>Giocatore</span><span>Utilizzato in una gara dei playoff</span><span>Effetto</span></div>
          {players.map((player) => (
            <div className="team-option-row" key={player.id}>
              <div className="team-option-player">
                <strong>{player.name}</strong>
                <span>{player.role ?? "X"} · G-League · {player.cost}</span>
              </div>
              <div className="team-option-decisions">
                <label className={selected[player.id] ? "selected exercise" : ""}>
                  <input type="checkbox" checked={selected[player.id] === true} onChange={(event) => {
                    setSelected((current) => ({ ...current, [player.id]: event.target.checked }));
                  }} />
                  Esercita T.O.
                </label>
              </div>
              <div className="team-option-destination">
                {selected[player.id] ? <span>Roster obbligatorio<br />all’inizio della prossima offseason</span> : <span>—</span>}
              </div>
            </div>
          ))}
          {!players.length && <p className="team-option-empty">Nessuna T.O. in G-League per questa squadra.</p>}
        </div>
        <button className="button primary team-option-save" type="submit" disabled={Boolean(errors.length) || !selectedPlayers.length || capWarnings.length > 0}>
          Registra esercizio anticipato{selectedPlayers.length ? ` (${selectedPlayers.length})` : ""}
        </button>
      </div>

      <aside className="team-option-recap">
        {selectedPlayers.length > 0 && <>
          <div className="auction-modal-summary cap-three-years">
            <Metric label={`Cap libero ${props.seasonName}`} value={`${formatSpace(team?.space ?? 0)} → ${formatSpace(currentSpaceAfter)}`} />
            <Metric label={`Cap libero ${nextSeasonName}`} value={`${formatSpace(team?.nextSpace ?? 0)} → ${formatSpace(nextSpaceAfter)}`} />
            <Metric label={`Cap libero ${followingSeasonName}`} value={`${formatSpace(team?.followingSpace ?? 0)} → ${formatSpace(followingSpaceAfter)}`} />
          </div>
          <div className="auction-modal-summary operation-comparison-summary">
            <Metric label="Slot" value={`${formatSlots(before)} → ${formatSlots(before)}`} />
            <Metric label="Ruoli" value={`${formatRoles(rolesBefore)} → ${formatRoles(rolesBefore)}`} />
            <Metric label="Promozione" value={`${nextSeasonName} · inizio offseason`} />
          </div>
        </>}
        <Validation errors={errors} />
        <CapBlocker warnings={capWarnings} />
      </aside>
    </form>
  );
}


export function SlotMoveForm(props: OperationProps) {
  const [teamCode, setTeamCode] = useState(props.teams[0]?.code ?? "");
  const [playerId, setPlayerId] = useState("");
  const [destination, setDestination] = useState<Exclude<Slot, "dpe">>("regular");
  const team = props.teams.find((item) => item.code === teamCode) ?? props.teams[0];
  const players = (team?.players ?? []).filter((player) => player.state === "active" && player.slot !== "dpe");
  const player = players.find((item) => item.id === playerId);
  const before = slotCounts(team);
  const after = { ...before };
  if (player && destination !== player.slot) { after[player.slot] -= 1; after[destination] += 1; }
  const eligibilityErrors = player ? slotEligibilityErrors(player, destination, props.seasonName) : [];
  const timingErrors = player ? slotMoveTimingErrors(
    { ...player, slot: player.slot as Exclude<Slot, "dpe"> },
    destination,
    props.seasonName,
    props.leagueMoment,
  ) : [];
  const capSeasonNames = [props.seasonName, seasonNameAt(props.seasonName, 1), seasonNameAt(props.seasonName, 2)];
  const capSpaces = [team?.space ?? 0, team?.nextSpace ?? 0, team?.followingSpace ?? 0];
  const errors = [
    ...(!player ? ["Seleziona un giocatore."] : []),
    ...(player && destination === player.slot ? ["Scegli uno slot diverso da quello attuale."] : []),
    ...eligibilityErrors,
    ...timingErrors,
    ...(after[destination] > slotLimits[destination] ? [`Lo slot ${slotLabel(destination)} è pieno.`] : []),
  ];
  const capWarnings = salaryCapWarningsForSpaces({ before: capSpaces, after: capSpaces, seasonNames: capSeasonNames, phase: props.phase, currentMoment: props.leagueMoment });
  const rolesBefore = roleCounts(team);
  const slotGroups: { slot: Exclude<Slot, "dpe">; label: string; limit: number }[] = [
    { slot: "regular", label: "Roster", limit: 15 },
    { slot: "two_way", label: "Two-way", limit: 2 },
    { slot: "g_league", label: "G-League", limit: 3 },
  ];

  function chooseDestination(selectedPlayer: AdminRosterPlayer, nextDestination: Exclude<Slot, "dpe">) {
    if (nextDestination === selectedPlayer.slot) {
      setPlayerId("");
      setDestination(nextDestination);
      return;
    }
    setPlayerId(selectedPlayer.id);
    setDestination(nextDestination);
  }

  return (
    <form action={moveRosterSlot} className="slot-management-workspace">
      <input type="hidden" name="team_code" value={teamCode} />
      <input type="hidden" name="player_name" value={player?.name ?? ""} />
      <input type="hidden" name="destination" value={destination} />
      <label className="admin-team-select">
        <span>Squadra</span>
        <TeamSelect teams={props.teams} value={teamCode} onChange={(value) => { setTeamCode(value); setPlayerId(""); }} />
      </label>

      <div className="team-accordion-content admin-editor-content slot-management-content">
        {slotGroups.map((group) => {
          const groupPlayers = players.filter((item) => item.slot === group.slot);
          return (
            <section className="accordion-data-section slot-management-section" key={group.slot}>
              <p>{group.label} ({groupPlayers.length}/{group.limit})</p>
              <div className="slot-management-table">
                <div className="slot-management-head"><span>Giocatore</span><span>Ruolo</span><span>Scadenza</span><span>Costo</span><span>Nuovo slot</span></div>
                {groupPlayers.map((item) => {
                  const selected = item.id === playerId;
                  const rowDestination = selected ? destination : item.slot as Exclude<Slot, "dpe">;
                  const legalDestinations = legalSlotDestinations(
                    { ...item, slot: item.slot as Exclude<Slot, "dpe"> },
                    props.seasonName,
                    props.leagueMoment,
                  );
                  return (
                    <div className={`slot-management-row ${selected ? "selected" : ""}`} key={item.id}>
                      <strong>{item.name}</strong>
                      <i className={`mini-role mini-role-${item.role?.toLowerCase() ?? "none"}`}>{item.role ?? "X"}</i>
                      <span>{item.contract}</span>
                      <b>{item.cost}</b>
                      <select value={rowDestination} disabled={legalDestinations.length === 1} onChange={(event) => chooseDestination(item, event.target.value as Exclude<Slot, "dpe">)} aria-label={`Nuovo slot di ${item.name}`}>
                        {legalDestinations.map((slot) => (
                          <option value={slot} key={slot}>{slotLabel(slot)}{item.slot === slot ? " · attuale" : ""}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
                {!groupPlayers.length && <div className="data-empty">—</div>}
              </div>
            </section>
          );
        })}

        {player && (
          <div className="slot-management-selection">
            <div><span>Operazione selezionata</span><strong>{player.name}: {slotLabel(player.slot)} → {slotLabel(destination)}</strong></div>
          </div>
        )}

        {player && (
          <div className="slot-management-recap">
            <div className="auction-modal-summary cap-three-years">
              {capSeasonNames.map((seasonName, index) => <Metric label={`Cap libero ${seasonName}`} value={`${formatSpace(capSpaces[index])} → ${formatSpace(capSpaces[index])}`} key={seasonName} />)}
            </div>
            <div className="auction-modal-summary operation-comparison-summary">
              <Metric label="Slot" value={`${formatSlots(before)} → ${formatSlots(after)}`} />
              <Metric label="Ruoli" value={`${formatRoles(rolesBefore)} → ${formatRoles(rolesBefore)}`} />
              <Metric label="Spostamento" value={`${slotLabel(player.slot)} → ${slotLabel(destination)}`} />
            </div>
            <Validation errors={errors} warnings={capWarnings} />
          </div>
        )}
      </div>
      <button className="button primary slot-management-save" type="submit" disabled={errors.length > 0}>Registra cambio slot</button>
    </form>
  );
}


export function PostAuctionContractForm(props: OperationProps & { contractDrafts: PostAuctionContractDraft[] }) {
  const [teamCode, setTeamCode] = useState(props.teams[0]?.code ?? "");
  type ContractKind = PostAuctionContractKind;
  type ContractSlot = "regular" | "two_way" | "g_league";
  type ContractAssignment = { contract: ContractKind; slot: ContractSlot };
  const [assignments, setAssignments] = useState<Record<string, ContractAssignment>>(() => Object.fromEntries(
    props.teams.flatMap((team) => team.players.flatMap((player) => {
      const draft = props.contractDrafts.find((item) => item.teamCode === team.code && item.playerName === player.name);
      return draft ? [[player.id, { contract: draft.contractKind, slot: draft.slot }]] : [];
    })),
  ));
  const team = props.teams.find((item) => item.code === teamCode) ?? props.teams[0];
  const players = (team?.players ?? []).filter((player) => {
    return isPostAuctionContractAssignmentCandidate(player, props.seasonName);
  });
  const selectedAssignments = players.flatMap((player) => {
    const assignment = assignments[player.id];
    return assignment ? [{ player, assignment }] : [];
  });
  const capSeasonNames = [props.seasonName, seasonNameAt(props.seasonName, 1), seasonNameAt(props.seasonName, 2)];
  const capSpacesBefore = [team?.space ?? 0, team?.nextSpace ?? 0, team?.followingSpace ?? 0];
  const capSpacesAfter = selectedAssignments.reduce((spaces, { player, assignment }) => {
    const annualCost = contractAnnualCost(player.auctionPrice ?? player.cost, assignment.contract);
    spaces[0] += player.currentCapCost - annualCost;
    if (assignment.contract === "biennial" || assignment.contract === "triennial") spaces[1] -= annualCost;
    if (assignment.contract === "triennial") spaces[2] -= annualCost;
    return spaces;
  }, [...capSpacesBefore]);
  const errors = [
    ...(!operationWindows.contractAssignment(props.leagueMoment) ? ["L’assegnazione è disponibile dal termine dell’asta fino alla consegna dei contratti."] : []),
  ];
  selectedAssignments.forEach(({ player, assignment }) => {
    const auctionPrice = player.auctionPrice ?? player.cost;
    const destinationSpecial = assignment.slot === "two_way" || assignment.slot === "g_league";
    const optionEligible = player.rookie || (player.under23 && auctionPrice <= 15);
    if (player.state === "cut" && assignment.slot !== "regular") errors.push(`${player.name}: un giocatore tagliato deve restare fuori dagli slot attivi.`);
    if (!allowedPostAuctionContracts(player.auctionAcquisition).includes(assignment.contract)) {
      errors.push(player.auctionAcquisition === "qualifying_offer"
        ? `${player.name}: una Q.O. accettata richiede il contratto annuale.`
        : `${player.name}: un restricted free agent può ricevere soltanto un contratto annuale o biennale.`);
    }
    if (player.auctionAcquisition && assignment.slot !== "regular") errors.push(`${player.name}: deve restare nello slot roster.`);
    if (destinationSpecial && assignment.contract !== "team_option") errors.push(`${player.name}: negli slot speciali è selezionabile soltanto la T.O.`);
    if (assignment.contract === "team_option" && !optionEligible) {
      errors.push(`${player.name}: la T.O. richiede un rookie oppure un U23 acquistato a massimo 15.`);
    }
    if (assignment.slot === "two_way" && auctionPrice > 10) errors.push(`${player.name}: il Two-way richiede un costo massimo di 10.`);
    if (assignment.slot === "g_league" && auctionPrice > 5) errors.push(`${player.name}: la G-League richiede un costo massimo di 5.`);
  });
  const slotsAfterAssignments = selectedAssignments.reduce((counts, { player, assignment }) => {
    if (player.slot !== assignment.slot) {
      if (player.slot !== "dpe") counts[player.slot] -= 1;
      counts[assignment.slot] += 1;
    }
    return counts;
  }, slotCounts(team));
  if (slotsAfterAssignments.regular > 15) errors.push("Gli spostamenti superano i 15 slot roster.");
  if (slotsAfterAssignments.two_way > 2) errors.push("Gli spostamenti superano i 2 slot Two-way.");
  if (slotsAfterAssignments.g_league > 3) errors.push("Gli spostamenti superano i 3 slot G-League.");
  const slotsBeforeAssignments = slotCounts(team);
  const rolesBeforeAssignments = roleCounts(team);
  const capWarnings = capSpacesAfter.flatMap((space, index) => (
    index > 0 && space < 0 ? [`I contratti portano il cap libero ${capSeasonNames[index]} a ${space}.`] : []
  ));

  function setAssignment(player: AdminRosterPlayer, contract?: ContractKind) {
    setAssignments((current) => {
      const next = { ...current };
      if (contract) next[player.id] = { contract, slot: current[player.id]?.slot ?? (player.slot === "dpe" ? "regular" : player.slot) };
      else delete next[player.id];
      return next;
    });
  }
  function setContractSlot(player: AdminRosterPlayer, slot: ContractSlot) {
    if (player.state === "cut" && slot !== "regular") return;
    setAssignments((current) => ({
      ...current,
      [player.id]: {
        contract: (slot === "regular" && player.slot === "regular" ? current[player.id]?.contract : "team_option") ?? "team_option",
        slot,
      },
    }));
  }

  const serializedAssignments = selectedAssignments.map(({ player, assignment }) => ({ playerName: player.name, ...assignment }));
  const contractChoices: { kind: ContractKind; label: string }[] = [
    { kind: "annual", label: String(props.seasonEndYear).slice(-2) },
    { kind: "biennial", label: String(props.seasonEndYear + 1).slice(-2) },
    { kind: "triennial", label: String(props.seasonEndYear + 2).slice(-2) },
    { kind: "team_option", label: "T.O." },
  ];

  return (
    <form action={assignPostAuctionContracts} className="contract-assignment-workspace">
      <input type="hidden" name="team_code" value={teamCode} />
      <input type="hidden" name="assignments_json" value={JSON.stringify(serializedAssignments)} />
      <div className="contract-assignment-editor">
        <div className="guided-operation-toolbar">
          <label className="admin-team-select contract-assignment-team-select">
            <span>Squadra</span>
            <TeamSelect teams={props.teams} value={teamCode} onChange={(value) => { setTeamCode(value); }} />
          </label>
        </div>

        <div className="contract-assignment-list">
          <div className="contract-assignment-head"><span>Giocatore</span><span>Prezzo</span><span>Contratto</span><span>Slot</span></div>
          {players.map((player) => {
            const assignment = assignments[player.id];
            const auctionPrice = player.auctionPrice ?? player.cost;
            const selectedSlot = assignment?.slot ?? player.slot;
            const destinationRequiresOption = selectedSlot === "two_way" || selectedSlot === "g_league";
            const optionEligible = player.rookie || (player.under23 && auctionPrice <= 15);
            const allowedContracts = allowedPostAuctionContracts(player.auctionAcquisition);
            return (
              <div className={`contract-assignment-row ${assignment ? "selected" : ""}`} key={player.id}>
                <div className="guided-operation-player"><strong>{player.name}</strong><span>{player.role ?? "X"} · {player.state === "cut" ? "Tagliato" : slotLabel(player.slot)}{player.auctionAcquisition ? ` · ${auctionAcquisitionLabel(player.auctionAcquisition)}` : ""}</span></div>
                <strong className="contract-auction-price">{auctionPrice}</strong>
                <div className="contract-choice-list">
                  {contractChoices.map((choice) => {
                    const disabled = !allowedContracts.includes(choice.kind)
                      || (destinationRequiresOption
                        ? choice.kind !== "team_option" || !optionEligible
                        : choice.kind === "team_option" && !optionEligible);
                    const finalCost = contractAnnualCost(auctionPrice, choice.kind);
                    return (
                      <label className={assignment?.contract === choice.kind ? "selected" : ""} key={choice.kind}>
                        <input type="radio" name={`contract-${player.id}`} checked={assignment?.contract === choice.kind} disabled={disabled} onChange={() => setAssignment(player, choice.kind)} />
                        <span>{choice.label}</span>
                        <small>{finalCost}</small>
                      </label>
                    );
                  })}
                  {assignment && <button type="button" onClick={() => setAssignment(player)}>Rimuovi bozza</button>}
                </div>
                <select className="contract-slot-select" value={assignment?.slot ?? (player.state === "cut" || player.slot === "dpe" ? "regular" : player.slot)} onChange={(event) => setContractSlot(player, event.target.value as ContractSlot)} disabled={player.state === "cut"}>
                  <option value="regular">Roster</option>
                  <option value="two_way" disabled={Boolean(player.auctionAcquisition) || auctionPrice > 10 || !optionEligible}>Two-way</option>
                  <option value="g_league" disabled={Boolean(player.auctionAcquisition) || auctionPrice > 5 || !optionEligible}>G-League</option>
                </select>
              </div>
            );
          })}
          {!players.length && <p className="team-option-empty">Nessun giocatore con contratto da assegnare.</p>}
        </div>
        <button className="button primary guided-operation-save" type="submit" disabled={errors.length > 0 || capWarnings.length > 0}>Salva bozza privata ({selectedAssignments.length})</button>
      </div>

      <aside className="guided-operation-recap contract-assignment-recap">
        {selectedAssignments.length > 0 && <>
          <div className="auction-modal-summary cap-three-years">
          {capSeasonNames.map((seasonName, index) => (
            <Metric label={`Spazio ${seasonName}`} value={`${formatSpace(capSpacesBefore[index])} → ${formatSpace(capSpacesAfter[index])}`} key={seasonName} />
          ))}
          </div>
          <div className="auction-modal-summary operation-comparison-summary">
            <Metric label="Slot" value={`${formatSlots(slotsBeforeAssignments)} → ${formatSlots(slotsAfterAssignments)}`} />
            <Metric label="Ruoli" value={`${formatRoles(rolesBeforeAssignments)} → ${formatRoles(rolesBeforeAssignments)}`} />
          </div>
        </>}
        <Validation errors={errors} />
        <CapBlocker warnings={capWarnings} />
      </aside>
    </form>
  );
}

function contractAnnualCost(price: number, contract: "annual" | "biennial" | "triennial" | "team_option") {
  const multiplier = contract === "triennial" ? .9 : contract === "biennial" ? .95 : 1;
  return Math.ceil(price * multiplier);
}
