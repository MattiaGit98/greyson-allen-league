"use client";

import { useState, type ReactNode } from "react";
import { allowedPostAuctionContracts, auctionAcquisitionLabel, isPostAuctionContractAssignmentCandidate, type PostAuctionContractKind } from "@/lib/auction-management";
import { assignPostAuctionContracts } from "@/app/admin/contratti/actions";
import { moveRosterSlot } from "@/app/admin/slot/actions";
import { exercisePlayoffTeamOptions, saveRookieContractDecisions } from "@/app/admin/team-option/actions";
import type { AdminRosterPlayer, AdminRosterTeam } from "@/lib/admin-operation-data";
import { operationWindows, type LeagueMoment } from "@/lib/league-moments";
import { CapBlocker } from "@/app/admin/cap-force-control";
import { salaryCapWarningsForSpaces } from "@/lib/cap-override";
import { legalSlotDestinations, slotEligibilityErrors, slotMoveTimingErrors } from "@/lib/slot-eligibility";
import { destinationAfterTeamOptionExercise } from "@/lib/team-option-contract";
import type { PostAuctionContractDraft } from "@/lib/post-auction-contracts";
import { dpeCountsForRoleMinimums } from "@/lib/role-minimums";

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

function roleCounts(team: AdminRosterTeam | undefined, leagueMoment: LeagueMoment) {
  return (team?.players ?? [])
    .filter((player) => player.state === "active" && (player.slot !== "dpe" || dpeCountsForRoleMinimums(leagueMoment)))
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
  const teamOptionPlayers = (team?.players ?? []).filter((player) => player.state === "active" && player.isTeamOption);
  const rookieExtensionPlayers = (team?.players ?? []).filter((player) => player.state === "active" && player.isRookieExtensionDue);
  const players = [...teamOptionPlayers, ...rookieExtensionPlayers];
  const before = slotCounts(team);
  const after = { ...before };
  const selectedPlayers = players.filter((player) => decisions[player.id]);
  const exercisedOptions = teamOptionPlayers.filter((player) => decisions[player.id] === "exercise");
  const appliedExtensions = rookieExtensionPlayers.filter((player) => decisions[player.id] === "exercise");
  const rolesBefore = roleCounts(team, props.leagueMoment);
  const rolesAfter = { ...rolesBefore };
  const destinationFor = (player: AdminRosterPlayer): Slot => {
    return destinationAfterTeamOptionExercise(player.slot, gLeagueDestinations[player.id] ?? "two_way");
  };
  teamOptionPlayers.forEach((player) => {
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
  rookieExtensionPlayers.forEach((player) => {
    const decision = decisions[player.id];
    if (decision === "decline") {
      after[player.slot] -= 1;
      if (player.slot !== "dpe" && player.role) rolesAfter[player.role] -= 1;
    }
    if (decision === "exercise" && player.slot !== "regular") {
      after[player.slot] -= 1;
      after.regular += 1;
    }
  });
  const exercisedCost = exercisedOptions.reduce((total, player) => total + player.cost, 0);
  const extensionCost = appliedExtensions.reduce((total, player) => total + player.cost * 2, 0);
  const currentSpaceAfter = (team?.spaceBeforeOptions ?? 0) - exercisedCost - extensionCost;
  const nextSpaceAfter = team?.nextSpace ?? 0;
  const followingSpaceAfter = team?.followingSpace ?? 0;
  const nextSeasonName = seasonNameAt(props.seasonName, 1);
  const followingSeasonName = seasonNameAt(props.seasonName, 2);
  const errors = [
    ...(!operationWindows.teamOption(props.leagueMoment)
      ? ["I contratti da rookie si possono risolvere soltanto in Offseason — prima della relativa scadenza."]
      : []),
    ...(after.regular > slotLimits.regular ? ["Le decisioni selezionate superano i 15 slot roster."] : []),
    ...(after.two_way > slotLimits.two_way ? ["Le decisioni selezionate superano i 2 slot Two-way."] : []),
    ...(after.g_league > slotLimits.g_league ? ["Le decisioni selezionate superano i 3 slot G-League."] : []),
  ];
  const capWarnings = [
    ...(currentSpaceAfter < 0 ? [`Le decisioni portano il cap libero ${props.seasonName} a ${currentSpaceAfter}.`] : []),
    ...(nextSpaceAfter < 0 ? [`Il cap libero ${nextSeasonName} è ${nextSpaceAfter}.`] : []),
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
    kind: player.isTeamOption ? "team_option" : "rookie_extension",
    decision: decisions[player.id],
    destination: player.isTeamOption && destinationFor(player) === "two_way" ? "two_way" : "regular",
  }));

  return (
    <form action={saveRookieContractDecisions} className="team-option-workspace">
      <input type="hidden" name="team_code" value={teamCode} />
      <input type="hidden" name="decisions_json" value={JSON.stringify(serializedDecisions)} />
      <div className="team-option-editor">
        <label className="admin-team-select team-option-team-select">
          <span>Squadra</span>
          <TeamSelect teams={props.teams} value={teamCode} onChange={(value) => { setTeamCode(value); setDecisions({}); setGLeagueDestinations({}); }} />
        </label>
        <div className="team-option-section-title"><span>Team option</span><strong>Decisione dopo il primo anno</strong></div>
        <div className="team-option-list">
          <div className="team-option-list-head"><span>Giocatore</span><span>Decisione</span><span>Destinazione</span></div>
          {teamOptionPlayers.map((player) => {
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
                    Lascia scadere
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
          {!teamOptionPlayers.length && <p className="team-option-empty">Nessuna team option da risolvere per questa squadra.</p>}
        </div>

        <div className="team-option-section-title rookie-extension"><span>Rookie extension</span><strong>Decisione dopo il secondo anno</strong></div>
        <div className="team-option-list rookie-extension-list">
          <div className="team-option-list-head"><span>Giocatore</span><span>Decisione</span></div>
          {rookieExtensionPlayers.map((player) => {
            const decision = decisions[player.id];
            return (
              <div className="team-option-row" key={player.id}>
                <div className="team-option-player">
                  <strong>{player.name}</strong>
                  <span>{player.role ?? "X"} · {slotLabel(player.slot)} · {player.cost} → {player.cost * 2} crediti</span>
                </div>
                <div className="team-option-decisions">
                  <label className={decision === "exercise" ? "selected exercise" : ""}>
                    <input type="checkbox" checked={decision === "exercise"} onChange={(event) => setDecision(player.id, "exercise", event.target.checked)} />
                    Applica
                  </label>
                  <label className={decision === "decline" ? "selected decline" : ""}>
                    <input type="checkbox" checked={decision === "decline"} onChange={(event) => setDecision(player.id, "decline", event.target.checked)} />
                    Non applicare
                  </label>
                </div>
              </div>
            );
          })}
          {!rookieExtensionPlayers.length && <p className="team-option-empty">Nessuna rookie extension da risolvere per questa squadra.</p>}
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
    player.state === "active" && player.slot === "g_league" && player.hasAnnualTeamOption
  ));
  const selectedPlayers = players.filter((player) => selected[player.id]);
  const before = slotCounts(team);
  const rolesBefore = roleCounts(team, props.leagueMoment);
  const exercisedCost = selectedPlayers.reduce((total, player) => total + player.cost, 0);
  const nextSeasonName = seasonNameAt(props.seasonName, 1);
  const followingSeasonName = seasonNameAt(props.seasonName, 2);
  const currentSpaceAfter = team?.space ?? 0;
  const nextSpaceAfter = (team?.nextSpace ?? 0) - exercisedCost;
  const followingSpaceAfter = team?.followingSpace ?? 0;
  const errors = !operationWindows.playoffTeamOption(props.leagueMoment)
    ? ["L'esercizio anticipato per utilizzo nei playoff è disponibile dopo la Chiusura free agency."]
    : [];
  const capWarnings = [
    ...(currentSpaceAfter < 0 ? [`Il cap libero ${props.seasonName} è ${currentSpaceAfter}.`] : []),
    ...(nextSpaceAfter < 0 ? [`Gli esercizi portano il cap libero ${nextSeasonName} a ${nextSpaceAfter}.`] : []),
    ...(followingSpaceAfter < 0 ? [`Il cap libero ${followingSeasonName} è ${followingSpaceAfter}.`] : []),
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
  const [destinations, setDestinations] = useState<Record<string, Exclude<Slot, "dpe">>>({});
  const team = props.teams.find((item) => item.code === teamCode) ?? props.teams[0];
  const players = (team?.players ?? []).filter((player) => player.state === "active" && player.slot !== "dpe");
  const selectedMoves = players.flatMap((player) => {
    const destination = destinations[player.id];
    return destination && destination !== player.slot ? [{ player, destination }] : [];
  });
  const before = slotCounts(team);
  const after = { ...before };
  selectedMoves.forEach(({ player, destination }) => {
    after[player.slot] -= 1;
    after[destination] += 1;
  });
  const moveErrors = selectedMoves.flatMap(({ player, destination }) => [
    ...slotEligibilityErrors(player, destination, props.seasonName),
    ...slotMoveTimingErrors(
      { ...player, slot: player.slot as Exclude<Slot, "dpe"> },
      destination,
      props.seasonName,
      props.leagueMoment,
    ),
  ].map((error) => `${player.name}: ${error}`));
  const capSeasonNames = [props.seasonName, seasonNameAt(props.seasonName, 1), seasonNameAt(props.seasonName, 2)];
  const capSpaces = [team?.space ?? 0, team?.nextSpace ?? 0, team?.followingSpace ?? 0];
  const errors = [
    ...(!selectedMoves.length ? ["Seleziona almeno uno spostamento."] : []),
    ...moveErrors,
    ...(Object.keys(slotLimits) as Slot[]).flatMap((slot) => (
      after[slot] > slotLimits[slot] ? [`Lo slot ${slotLabel(slot)} è pieno (${after[slot]}/${slotLimits[slot]}).`] : []
    )),
  ];
  const capWarnings = salaryCapWarningsForSpaces({ before: capSpaces, after: capSpaces, seasonNames: capSeasonNames, phase: props.phase, currentMoment: props.leagueMoment });
  const rolesBefore = roleCounts(team, props.leagueMoment);
  const slotGroups: { slot: Exclude<Slot, "dpe">; label: string; limit: number }[] = [
    { slot: "regular", label: "Roster", limit: 15 },
    { slot: "two_way", label: "Two-way", limit: 2 },
    { slot: "g_league", label: "G-League", limit: 3 },
  ];

  function chooseDestination(selectedPlayer: AdminRosterPlayer, nextDestination: Exclude<Slot, "dpe">) {
    if (nextDestination === selectedPlayer.slot) {
      setDestinations((current) => {
        const next = { ...current };
        delete next[selectedPlayer.id];
        return next;
      });
      return;
    }
    setDestinations((current) => ({ ...current, [selectedPlayer.id]: nextDestination }));
  }

  return (
    <form action={moveRosterSlot} className="slot-management-workspace">
      <input type="hidden" name="team_code" value={teamCode} />
      <input type="hidden" name="moves_json" value={JSON.stringify(selectedMoves.map(({ player, destination }) => ({ playerName: player.name, destination })))} />
      <label className="admin-team-select">
        <span>Squadra</span>
        <TeamSelect teams={props.teams} value={teamCode} onChange={(value) => { setTeamCode(value); setDestinations({}); }} />
      </label>

      <div className="team-accordion-content admin-editor-content other-operations-content slot-management-content">
        {slotGroups.map((group) => {
          const groupPlayers = players.filter((item) => item.slot === group.slot);
          return (
            <section className="accordion-data-section other-operations-section slot-management-section" key={group.slot}>
              <p>{group.label} ({groupPlayers.length}/{group.limit})</p>
              <div className="other-operations-table slot-management-table">
                <div className="other-operations-head slot-management-head"><span>Giocatore</span><span>Ruolo</span><span>Scadenza</span><span>Costo</span><span>Nuovo slot</span></div>
                {groupPlayers.map((item) => {
                  const selected = Boolean(destinations[item.id] && destinations[item.id] !== item.slot);
                  const rowDestination = destinations[item.id] ?? item.slot as Exclude<Slot, "dpe">;
                  const legalDestinations = legalSlotDestinations(
                    { ...item, slot: item.slot as Exclude<Slot, "dpe"> },
                    props.seasonName,
                    props.leagueMoment,
                  );
                  return (
                    <div className={`other-operations-row slot-management-row ${selected ? "selected" : ""}`} key={item.id}>
                      <strong>{item.name}</strong>
                      <span>{item.role ?? "X"}</span>
                      <span>{item.contract}</span>
                      <span>{item.cost}</span>
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

        {selectedMoves.length > 0 && (
          <div className="slot-management-selection">
            <div>
              <span>Spostamenti selezionati</span>
              <div className="slot-management-move-list">
                {selectedMoves.map(({ player, destination }) => <strong key={player.id}>{player.name}: {slotLabel(player.slot)} → {slotLabel(destination)}</strong>)}
              </div>
            </div>
          </div>
        )}

        {selectedMoves.length > 0 && (
          <div className="slot-management-recap">
            <div className="auction-modal-summary cap-three-years">
              {capSeasonNames.map((seasonName, index) => <Metric label={`Cap libero ${seasonName}`} value={`${formatSpace(capSpaces[index])} → ${formatSpace(capSpaces[index])}`} key={seasonName} />)}
            </div>
            <div className="auction-modal-summary operation-comparison-summary">
              <Metric label="Slot" value={`${formatSlots(before)} → ${formatSlots(after)}`} />
              <Metric label="Ruoli" value={`${formatRoles(rolesBefore)} → ${formatRoles(rolesBefore)}`} />
              <Metric label="Spostamenti" value={selectedMoves.length} />
            </div>
            <Validation errors={errors} warnings={capWarnings} />
          </div>
        )}
      </div>
      <button className="button primary slot-management-save" type="submit" disabled={errors.length > 0}>Registra spostamenti{selectedMoves.length ? ` (${selectedMoves.length})` : ""}</button>
    </form>
  );
}


export function PostAuctionContractForm(props: OperationProps & { contractDrafts: PostAuctionContractDraft[] }) {
  const [teamCode, setTeamCode] = useState(props.teams[0]?.code ?? "");
  type ContractKind = PostAuctionContractKind;
  type ContractAssignment = { contract: ContractKind };
  const [assignments, setAssignments] = useState<Record<string, ContractAssignment>>(() => Object.fromEntries(
    props.teams.flatMap((team) => team.players.flatMap((player) => {
      const draft = props.contractDrafts.find((item) => item.teamCode === team.code && item.playerName === player.name);
      return draft ? [[player.id, { contract: draft.contractKind }]] : [];
    })),
  ));
  const team = props.teams.find((item) => item.code === teamCode) ?? props.teams[0];
  const contractSlotOrder: Record<AdminRosterPlayer["slot"], number> = {
    regular: 0,
    two_way: 1,
    g_league: 2,
    dpe: 3,
  };
  const players = (team?.players ?? [])
    .filter((player) => isPostAuctionContractAssignmentCandidate(player, props.seasonName))
    .sort((left, right) => (
      contractSlotOrder[left.slot] - contractSlotOrder[right.slot]
      || (right.auctionPrice ?? right.cost) - (left.auctionPrice ?? left.cost)
      || left.name.localeCompare(right.name, "it")
    ));
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
    const currentSpecialSlot = player.slot === "two_way" || player.slot === "g_league";
    const optionEligible = player.rookie || (player.under23 && auctionPrice <= 15);
    if (!allowedPostAuctionContracts(player.auctionAcquisition).includes(assignment.contract)) {
      errors.push(player.auctionAcquisition === "qualifying_offer"
        ? `${player.name}: una Q.O. accettata richiede il contratto annuale.`
        : `${player.name}: un restricted free agent può ricevere soltanto un contratto annuale, biennale o triennale.`);
    }
    if (player.auctionAcquisition && player.slot !== "regular") errors.push(`${player.name}: deve restare nello slot roster.`);
    if (currentSpecialSlot && assignment.contract !== "team_option") errors.push(`${player.name}: negli slot speciali è selezionabile soltanto la T.O.`);
    if (assignment.contract === "team_option" && !optionEligible) {
      errors.push(`${player.name}: la T.O. richiede un rookie oppure un U23 acquistato a massimo 15.`);
    }
    if (player.slot === "two_way" && auctionPrice > 10) errors.push(`${player.name}: il Two-way richiede un costo massimo di 10.`);
    if (player.slot === "g_league" && auctionPrice > 5) errors.push(`${player.name}: la G-League richiede un costo massimo di 5.`);
  });
  const capWarnings = capSpacesAfter.flatMap((space, index) => (
    index > 0 && space < 0 ? [`I contratti portano il cap libero ${capSeasonNames[index]} a ${space}.`] : []
  ));

  function setAssignment(player: AdminRosterPlayer, contract?: ContractKind) {
    setAssignments((current) => {
      const next = { ...current };
      if (contract) next[player.id] = { contract };
      else delete next[player.id];
      return next;
    });
  }
  const serializedAssignments = selectedAssignments.map(({ player, assignment }) => ({ playerName: player.name, ...assignment }));
  const contractChoices: { kind: ContractKind; label: string }[] = [
    { kind: "annual", label: String(props.seasonEndYear).slice(-2) },
    { kind: "biennial", label: String(props.seasonEndYear + 1).slice(-2) },
    { kind: "triennial", label: String(props.seasonEndYear + 2).slice(-2) },
    { kind: "team_option", label: `${String(props.seasonEndYear).slice(-2)} + T.O.` },
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
          <div className="contract-assignment-head"><span>Giocatore</span><span>Prezzo</span><span>Contratto</span></div>
          {players.map((player) => {
            const assignment = assignments[player.id];
            const auctionPrice = player.auctionPrice ?? player.cost;
            const startsInSpecialSlot = player.slot === "two_way" || player.slot === "g_league";
            const optionEligible = player.rookie || (player.under23 && auctionPrice <= 15);
            const allowedContracts = allowedPostAuctionContracts(player.auctionAcquisition);
            return (
              <div className={`contract-assignment-row ${assignment ? "selected" : ""}`} key={player.id}>
                <div className="guided-operation-player"><strong>{player.name}</strong><span>{player.role ?? "X"} · {player.state === "cut" ? "Tagliato" : slotLabel(player.slot)}{player.auctionAcquisition ? ` · ${auctionAcquisitionLabel(player.auctionAcquisition)}` : ""}</span></div>
                <strong className="contract-auction-price">{auctionPrice}</strong>
                <div className="contract-choice-list">
                  {contractChoices.map((choice) => {
                    const disabled = !allowedContracts.includes(choice.kind)
                      || (startsInSpecialSlot && choice.kind !== "team_option")
                      || (choice.kind === "team_option" && !optionEligible);
                    const finalCost = contractAnnualCost(auctionPrice, choice.kind);
                    const choiceLabel = choice.kind === "annual" && finalCost === 1
                      ? `${choice.label} → Q.O.`
                      : choice.kind === "triennial" && auctionPrice >= 200
                        ? `${choice.label} + EXT`
                        : choice.label;
                    return (
                      <label className={assignment?.contract === choice.kind ? "selected" : ""} key={choice.kind}>
                        <input type="radio" name={`contract-${player.id}`} checked={assignment?.contract === choice.kind} disabled={disabled} onChange={() => setAssignment(player, choice.kind)} />
                        <span>{choiceLabel}</span>
                        <small>{finalCost}</small>
                      </label>
                    );
                  })}
                  {assignment && <button type="button" onClick={() => setAssignment(player)}>Rimuovi bozza</button>}
                </div>
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
