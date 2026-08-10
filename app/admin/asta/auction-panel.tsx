"use client";

import { useEffect, useMemo, useState } from "react";
import {
  auctionAcquisitionLabel,
  auctionDestinationErrors,
  qualifyingAuctionErrors,
  auctionSlotCapacityErrors,
  auctionSlotCountsAfterMove,
  auctionSlotLimits,
  type AuctionSlot,
  type QualifyingAuctionOutcome,
} from "@/lib/auction-management";
import type { AuctionAcquisitionKind } from "@/lib/league-types";
import { CapForceControl } from "@/app/admin/cap-force-control";
import { modifyAuctionPlayer, purchaseAuctionPlayer } from "./actions";

type AuctionTeam = {
  code: string;
  name: string;
  spaces: [number, number, number];
  slots: { regular: number; two_way: number; g_league: number };
  cutPlayerNames: string[];
  players: {
    name: string;
    role: "G" | "A" | "C" | null;
    cost: number;
    contract: string;
    slot: AuctionSlot;
  }[];
};

type AuctionRow = {
  name: string;
  role: "G" | "A" | "C" | "X";
  realTeam: string;
  rookie: boolean;
  under23: boolean;
  listOrder: number;
  roster: null | {
    teamCode: string;
    cost: number;
    contract: string;
    slot: "regular" | "two_way" | "g_league" | "dpe";
    auctionAcquisition?: AuctionAcquisitionKind;
    charges: [number, number, number];
  };
  qualifying: null | { teamCode: string; amount: number };
};

export function AuctionPanel({
  rows,
  teams,
  phase,
  seasonName,
  pendingDraftPicks,
}: {
  rows: AuctionRow[];
  teams: AuctionTeam[];
  phase: string;
  seasonName: string;
  pendingDraftPicks: number;
}) {
  const [query, setQuery] = useState("");
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const selected = rows.find((row) => row.name === selectedName) ?? null;
  const filtered = useMemo(() => rows.filter((row) => (
    row.name.toLocaleLowerCase("it").includes(query.trim().toLocaleLowerCase("it"))
  )), [query, rows]);

  useEffect(() => {
    if (!selected) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedName(null);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [selected]);

  return (
    <>
      <label className="auction-search search-field">
        <span>Cerca</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome del giocatore…" />
      </label>

      <div className="auction-player-list">
        <div className="auction-player-head">
          <span>#</span><span>Giocatore</span><span>Ruolo</span><span>Squadra reale</span><span>Stato</span><span></span>
        </div>
        {filtered.map((row) => (
          <article className={`auction-player-row ${row.rookie ? "is-rookie" : ""} ${row.under23 ? "is-under23" : ""}`} key={row.listOrder}>
            <span className="player-order">{row.listOrder}</span>
            <span className="player-identity">
              <strong className="player-name">{row.name}</strong>
              <span className="auction-player-subline">
                {row.realTeam && <small>{row.realTeam}</small>}
                {row.rookie && <i className="player-flag player-flag-rookie">Rookie</i>}
                {row.under23 && <i className="player-flag player-flag-u23">U23</i>}
              </span>
            </span>
            <span><i className={`mini-role mini-role-${row.role.toLowerCase()}`}>{row.role}</i></span>
            <strong className="real-team">{row.realTeam || "—"}</strong>
            <AuctionStatus row={row} />
            <button className={`auction-row-action ${row.roster ? "edit" : "bid"}`} type="button" onClick={() => setSelectedName(row.name)}>
              {row.roster ? "Modifica" : "Asta"}
            </button>
          </article>
        ))}
        {!filtered.length && <div className="data-empty">{rows.length ? "Nessun giocatore trovato" : "Listone non ancora pubblicato"}</div>}
      </div>

      {selected && (
        <div className="auction-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedName(null);
        }}>
          {selected.roster
            ? <EditPlayerDialog key={`edit-${selected.name}`} row={selected} rows={rows} teams={teams} phase={phase} seasonName={seasonName} pendingDraftPicks={pendingDraftPicks} onClose={() => setSelectedName(null)} />
            : <PurchasePlayerDialog key={`buy-${selected.name}`} row={selected} rows={rows} teams={teams} phase={phase} seasonName={seasonName} pendingDraftPicks={pendingDraftPicks} onClose={() => setSelectedName(null)} />}
        </div>
      )}
    </>
  );
}

function PurchasePlayerDialog({ row, teams, phase, seasonName, pendingDraftPicks = 0, onClose }: DialogProps & { pendingDraftPicks?: number }) {
  const [teamCode, setTeamCode] = useState(teams[0]?.code ?? "");
  const [price, setPrice] = useState(1);
  const [slot, setSlot] = useState<AuctionSlot>("regular");
  const [cutPlayerName, setCutPlayerName] = useState("");
  const [qualifyingOutcome, setQualifyingOutcome] = useState<QualifyingAuctionOutcome | "">(row.qualifying ? "" : "normal");
  const [forceCap, setForceCap] = useState(false);
  const constrainedAcquisition = qualifyingOutcome === "qualifying_offer" || qualifyingOutcome === "restricted_free_agent";
  const effectiveTeamCode = constrainedAcquisition ? row.qualifying?.teamCode ?? "" : teamCode;
  const effectivePrice = qualifyingOutcome === "qualifying_offer" ? row.qualifying?.amount ?? 0 : price;
  const effectiveSlot: AuctionSlot = constrainedAcquisition ? "regular" : slot;
  const team = teams.find((item) => item.code === effectiveTeamCode) ?? teams[0];
  const cutCandidates = (team?.players ?? []).filter((player) => player.slot === effectiveSlot);
  const cutPlayer = cutCandidates.find((player) => player.name === cutPlayerName);
  const errors = [
    ...(phase !== "auction" ? ["La fase della lega non è impostata su Asta."] : []),
    ...(pendingDraftPicks > 0 ? [`Il Draft dell'annata non è completo: restano ${pendingDraftPicks} scelte.`] : []),
    ...qualifyingAuctionErrors({
      hasQualifyingRight: Boolean(row.qualifying),
      outcome: qualifyingOutcome,
      rightTeamCode: row.qualifying?.teamCode,
      rightAmount: row.qualifying?.amount,
      teamCode: effectiveTeamCode,
      price: effectivePrice,
      slot: effectiveSlot,
    }),
    ...auctionDestinationErrors({ slot: effectiveSlot, price: effectivePrice, rookie: row.rookie, under23: row.under23 }),
  ];
  const capWarnings = (team && team.spaces[0] - effectivePrice < 0 && effectivePrice > 1)
    ? [`L'offerta supera quota 1000: in asta sarebbe consentito soltanto un acquisto da 1 credito (cap libero ${team.spaces[0]} → ${team.spaces[0] - effectivePrice}).`]
    : [];
  const afterSlots = team ? { ...team.slots, [effectiveSlot]: team.slots[effectiveSlot] + 1 } : null;
  if (afterSlots && cutPlayer) afterSlots[cutPlayer.slot] -= 1;
  const slotLimit = effectiveSlot === "regular" ? 15 : effectiveSlot === "two_way" ? 2 : 3;
  const slotErrors = afterSlots ? auctionSlotCapacityErrors(afterSlots) : [];
  const qoTeam = row.qualifying ? teams.find((item) => item.code === row.qualifying?.teamCode) : null;

  return (
    <form action={purchaseAuctionPlayer} className="auction-modal" role="dialog" aria-modal="true" aria-label={`Asta per ${row.name}`}>
      <input type="hidden" name="player_name" value={row.name} />
      <input type="hidden" name="team_code" value={effectiveTeamCode} />
      <input type="hidden" name="price" value={effectivePrice} />
      <input type="hidden" name="slot" value={effectiveSlot} />
      <input type="hidden" name="cut_player_name" value={cutPlayerName} />
      <input type="hidden" name="qualifying_outcome" value={qualifyingOutcome} />
      <input type="hidden" name="force_cap" value={String(forceCap)} />
      <ModalHeader row={row} label="Asta" onClose={onClose} />

      <div className="auction-modal-body">
        {row.qualifying && (
          <div className="auction-qo-owner">
            <span>Proprietario Q.O.</span>
            <strong>{qoTeam ? formatTeamName(qoTeam.name) : row.qualifying.teamCode}</strong>
            <small>{row.qualifying.amount} crediti</small>
          </div>
        )}
        <div className={`auction-modal-fields${row.qualifying ? " qualifying-outcome-layout" : ""}`}>
          {row.qualifying && (
            <Field label="Esito Q.O.">
              <select value={qualifyingOutcome} onChange={(event) => {
                const outcome = event.target.value as QualifyingAuctionOutcome | "";
                setQualifyingOutcome(outcome);
                setForceCap(false);
                setCutPlayerName("");
                if (outcome === "qualifying_offer" || outcome === "restricted_free_agent") setSlot("regular");
              }}>
                <option value="">Seleziona l'esito</option>
                <option value="normal">Asta normale</option>
                <option value="qualifying_offer">Q.O. accettata</option>
                <option value="restricted_free_agent">Restricted free agent</option>
              </select>
            </Field>
          )}
          <Field label="Squadra acquirente">
            <select value={effectiveTeamCode} disabled={constrainedAcquisition} onChange={(event) => { setTeamCode(event.target.value); setCutPlayerName(""); setForceCap(false); }}>
              {teams.map((item) => <option value={item.code} key={item.code}>{formatTeamName(item.name)}</option>)}
            </select>
          </Field>
          <Field label="Prezzo">
            <input type="number" min="1" step="1" inputMode="numeric" value={effectivePrice} disabled={qualifyingOutcome === "qualifying_offer"} onChange={(event) => { setPrice(Number(event.target.value)); setForceCap(false); }} />
          </Field>
          <Field label="Slot">
            <select value={effectiveSlot} disabled={constrainedAcquisition} onChange={(event) => {
              setSlot(event.target.value as AuctionSlot);
              setCutPlayerName("");
              setForceCap(false);
            }}>
              <option value="regular">Roster</option>
              <option value="two_way">Two-way</option>
              <option value="g_league">G-League</option>
            </select>
          </Field>
          <Field label="Giocatore da tagliare">
            <select value={cutPlayerName} onChange={(event) => { setCutPlayerName(event.target.value); setForceCap(false); }}>
              <option value="">Nessun taglio</option>
              {cutCandidates.map((player) => (
                <option value={player.name} key={player.name}>
                  {player.name} · {slotLabel(player.slot)} · {player.cost}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="auction-modal-summary">
          <Metric label={`Cap libero ${seasonName}`} value={team ? `${team.spaces[0]} → ${team.spaces[0] - effectivePrice}` : "—"} />
          <Metric label="Slot" value={team && afterSlots ? `${team.slots[effectiveSlot]}/${slotLimit} → ${afterSlots[effectiveSlot]}/${slotLimit}` : "—"} />
          <Metric label="Acquisto" value={qualifyingOutcome ? auctionAcquisitionLabel(qualifyingOutcome === "qualifying_offer" || qualifyingOutcome === "restricted_free_agent" ? qualifyingOutcome : undefined) : "Da specificare"} />
        </div>
        <CutPlayerCheck names={team?.cutPlayerNames ?? []} />
        {cutPlayer && <p className="auction-context-cut"><span>Taglio contestuale</span><strong>{cutPlayer.name}</strong></p>}
        {slotErrors.map((error) => <p className="validation error" key={error}>{error}</p>)}
        {errors.map((error) => <p className="validation error" key={error}>{error}</p>)}
        <CapForceControl warnings={capWarnings} checked={forceCap} onChange={setForceCap} />
      </div>
      <div className="auction-modal-actions">
        <button className="button secondary" type="button" onClick={onClose}>Annulla</button>
        <button className="button primary" type="submit" disabled={errors.length > 0 || slotErrors.length > 0 || !team || (capWarnings.length > 0 && !forceCap)}>Registra acquisto</button>
      </div>
    </form>
  );
}

function EditPlayerDialog({ row, rows, teams, phase, seasonName, pendingDraftPicks = 0, onClose }: DialogProps & { pendingDraftPicks?: number }) {
  const roster = row.roster!;
  const [kind, setKind] = useState<"delete" | "cut" | "price" | "slot">("price");
  const [newPrice, setNewPrice] = useState(roster.cost);
  const [newSlot, setNewSlot] = useState<AuctionSlot>(roster.slot === "dpe" ? "regular" : roster.slot);
  const [exchangePlayerName, setExchangePlayerName] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [forceCap, setForceCap] = useState(false);
  const team = teams.find((item) => item.code === roster.teamCode);
  const exchangeCandidates = roster.slot === "dpe" ? [] : rows.filter((item) => (
    item.name !== row.name
    && item.roster?.teamCode === roster.teamCode
    && item.roster.slot === newSlot
  ));
  const exchangePlayer = exchangeCandidates.find((item) => item.name === exchangePlayerName);
  const slotsAfterMove = team && kind === "slot"
    ? auctionSlotCountsAfterMove({
      counts: team.slots,
      fromSlot: roster.slot,
      toSlot: newSlot,
      hasExchange: Boolean(exchangePlayer),
    })
    : null;
  const afterSpaces = editSpaces(row, team, kind, newPrice, newSlot, exchangePlayer);
  const errors = [
    ...(phase !== "auction" ? ["La fase della lega non è impostata su Asta."] : []),
    ...(pendingDraftPicks > 0 ? [`Il Draft dell'annata non è completo: restano ${pendingDraftPicks} scelte.`] : []),
    ...(kind === "price" && (!Number.isInteger(newPrice) || newPrice < 1) ? ["Il prezzo deve essere un intero di almeno 1 credito."] : []),
    ...(kind === "price" && newPrice === roster.cost ? ["Il nuovo prezzo coincide con quello attuale."] : []),
    ...(kind === "slot" && newSlot === roster.slot ? ["Seleziona uno slot diverso da quello attuale."] : []),
    ...(kind === "slot" && roster.slot === "dpe" ? ["Il reintegro dalla DPE va registrato nel blocco Altre operazioni."] : []),
    ...(kind === "slot" && roster.auctionAcquisition && newSlot !== "regular" ? ["Un acquisto tramite Q.O. o come RFA deve restare nello slot roster."] : []),
    ...(kind === "slot" ? auctionDestinationErrors({ slot: newSlot, price: roster.cost, rookie: row.rookie, under23: row.under23 }) : []),
    ...(kind === "slot" && exchangePlayerName && !exchangePlayer ? ["Il giocatore scelto per lo scambio di slot non è più disponibile."] : []),
    ...(kind === "slot" && exchangePlayer?.roster?.auctionAcquisition && roster.slot !== "regular" ? [`${exchangePlayer.name}: un acquisto tramite Q.O. o come RFA deve restare nello slot roster.`] : []),
    ...(kind === "slot" && exchangePlayer && roster.slot !== "dpe" ? auctionDestinationErrors({
      slot: roster.slot,
      price: exchangePlayer.roster!.cost,
      rookie: exchangePlayer.rookie,
      under23: exchangePlayer.under23,
    }).map((error) => `${exchangePlayer.name}: ${error}`) : []),
    ...(kind === "slot" && slotsAfterMove ? auctionSlotCapacityErrors(slotsAfterMove) : []),
  ];
  const capWarnings = [
    ...((kind === "cut" && roster.slot === "dpe" && afterSpaces[0] < 0) ? [`Il taglio dalla DPE porta il cap libero a ${afterSpaces[0]}.`] : []),
    ...((kind === "price" && newPrice > roster.cost && afterSpaces[0] < 0) ? [`L'aumento del prezzo porta il cap libero a ${afterSpaces[0]}.`] : []),
    ...((kind === "slot" && roster.slot === "dpe" && afterSpaces[0] < 0) ? [`Lo spostamento dalla DPE porta il cap libero a ${afterSpaces[0]}.`] : []),
    ...(afterSpaces.slice(1).some((space) => space < 0) ? ["La modifica porta almeno una stagione futura oltre quota 1000."] : []),
  ];
  const details = modificationDetails(row, kind, newPrice, newSlot, team, afterSpaces, seasonName, exchangePlayer);

  if (reviewing) {
    return (
      <form action={modifyAuctionPlayer} className="auction-modal auction-confirm-modal" role="alertdialog" aria-modal="true" aria-label={`Conferma modifica di ${row.name}`}>
        <EditHiddenFields row={row} kind={kind} newPrice={newPrice} newSlot={newSlot} exchangePlayerName={exchangePlayerName} forceCap={forceCap} />
        <ModalHeader row={row} label="Conferma modifica" onClose={onClose} />
        <div className="auction-confirm-body">
          <p>Stai per applicare questa modifica:</p>
          <strong>{details.title}</strong>
          <ul>{details.lines.map((line) => <li key={line}>{line}</li>)}</ul>
          {capWarnings.length > 0 && <strong className="cap-forced-confirmation">SALARY CAP FORZATO</strong>}
        </div>
        <div className="auction-modal-actions">
          <button className="button secondary" type="button" onClick={() => setReviewing(false)}>Indietro</button>
          <button className="button primary danger-button" type="submit" disabled={pendingDraftPicks > 0}>Conferma definitivamente</button>
        </div>
      </form>
    );
  }

  return (
    <div className="auction-modal" role="dialog" aria-modal="true" aria-label={`Modifica ${row.name}`}>
      <ModalHeader row={row} label="Modifica" onClose={onClose} />
      <div className="auction-modal-body">
        <div className="auction-current-owner">
          <span>Squadra</span><strong>{team ? formatTeamName(team.name) : roster.teamCode}</strong>
          <small>{roster.cost} crediti · {slotLabel(roster.slot)} · {roster.contract}{roster.auctionAcquisition ? ` · ${auctionAcquisitionLabel(roster.auctionAcquisition)}` : ""}</small>
        </div>
        <div className="auction-modal-fields single-column">
          <Field label="Intervento">
            <select value={kind} onChange={(event) => { setKind(event.target.value as typeof kind); setExchangePlayerName(""); setReviewing(false); setForceCap(false); }}>
              <option value="delete">Elimina dal roster</option>
              <option value="cut">Taglia</option>
              <option value="price">Modifica prezzo</option>
              <option value="slot">Sposta di slot</option>
            </select>
          </Field>
          {kind === "price" && <Field label="Nuovo prezzo"><input type="number" min="1" step="1" inputMode="numeric" value={newPrice} onChange={(event) => { setNewPrice(Number(event.target.value)); setForceCap(false); }} /></Field>}
          {kind === "slot" && (
            <Field label="Nuovo slot">
              <select value={newSlot} onChange={(event) => { setNewSlot(event.target.value as AuctionSlot); setExchangePlayerName(""); setForceCap(false); }}>
                <option value="regular">Roster</option><option value="two_way">Two-way</option><option value="g_league">G-League</option>
              </select>
            </Field>
          )}
          {kind === "slot" && roster.slot !== "dpe" && (
            <Field label={`Giocatore da spostare in ${slotLabel(roster.slot)}`}>
              <select value={exchangePlayerName} onChange={(event) => { setExchangePlayerName(event.target.value); setForceCap(false); }}>
                <option value="">Nessuno</option>
                {exchangeCandidates.map((item) => (
                  <option value={item.name} key={item.name}>{item.name} · {item.roster!.cost} crediti</option>
                ))}
              </select>
            </Field>
          )}
        </div>
        <div className="auction-modal-summary cap-three-years">
          {afterSpaces.map((space, index) => (
            <Metric label={`Cap libero ${seasonLabel(seasonName, index)}`} value={team ? `${team.spaces[index]} → ${space}` : "—"} key={index} />
          ))}
          {kind === "slot" && team && slotsAfterMove && (
            <Metric
              label={`Slot ${slotLabel(newSlot)}`}
              value={`${team.slots[newSlot]}/${auctionSlotLimits[newSlot]} → ${slotsAfterMove[newSlot]}/${auctionSlotLimits[newSlot]}`}
            />
          )}
        </div>
        {errors.map((error) => <p className="validation error" key={error}>{error}</p>)}
        <CapForceControl warnings={capWarnings} checked={forceCap} onChange={setForceCap} />
      </div>
      <div className="auction-modal-actions">
        <button className="button secondary" type="button" onClick={onClose}>Annulla</button>
        <button className="button primary" type="button" disabled={errors.length > 0 || (capWarnings.length > 0 && !forceCap)} onClick={() => setReviewing(true)}>Salva modifica</button>
      </div>
    </div>
  );
}

function EditHiddenFields({ row, kind, newPrice, newSlot, exchangePlayerName, forceCap }: { row: AuctionRow; kind: string; newPrice: number; newSlot: AuctionSlot; exchangePlayerName: string; forceCap: boolean }) {
  return <>
    <input type="hidden" name="player_name" value={row.name} />
    <input type="hidden" name="team_code" value={row.roster?.teamCode ?? ""} />
    <input type="hidden" name="edit_kind" value={kind} />
    <input type="hidden" name="new_price" value={newPrice} />
    <input type="hidden" name="new_slot" value={newSlot} />
    <input type="hidden" name="exchange_player_name" value={exchangePlayerName} />
    <input type="hidden" name="force_cap" value={String(forceCap)} />
  </>;
}

function editSpaces(row: AuctionRow, team: AuctionTeam | undefined, kind: "delete" | "cut" | "price" | "slot", newPrice: number, newSlot: AuctionSlot, exchangePlayer?: AuctionRow): [number, number, number] {
  if (!team || !row.roster) return [0, 0, 0];
  const { roster } = row;
  if (kind === "delete") return team.spaces.map((space, index) => (
    space + (index === 0 && roster.slot === "dpe" ? 0 : roster.charges[index])
  )) as [number, number, number];
  if (kind === "cut") return [team.spaces[0] - (roster.slot === "dpe" ? roster.charges[0] : 0), team.spaces[1], team.spaces[2]];
  if (kind === "slot") {
    const after = [...team.spaces] as [number, number, number];
    if (roster.slot === "dpe") after[0] -= roster.charges[0];
    if (newSlot !== "regular" && roster.contract !== "T.O.") {
      after[1] += roster.charges[1];
      after[2] += roster.charges[2];
    }
    if (exchangePlayer?.roster && roster.slot !== "regular" && exchangePlayer.roster.contract !== "T.O.") {
      after[1] += exchangePlayer.roster.charges[1];
      after[2] += exchangePlayer.roster.charges[2];
    }
    return after;
  }
  const multipliers = roster.cost > 0 ? roster.charges.map((charge) => charge / roster.cost) : [0, 0, 0];
  return team.spaces.map((space, index) => (
    space + roster.charges[index] - newPrice * multipliers[index]
  )) as [number, number, number];
}

function modificationDetails(row: AuctionRow, kind: "delete" | "cut" | "price" | "slot", newPrice: number, newSlot: AuctionSlot, team: AuctionTeam | undefined, afterSpaces: [number, number, number], seasonName: string, exchangePlayer?: AuctionRow) {
  const roster = row.roster!;
  const lines = team ? afterSpaces.map((space, index) => `Cap libero ${seasonLabel(seasonName, index)}: ${team.spaces[index]} → ${space}`) : [];
  if (kind === "delete") return { title: `${row.name} sarà eliminato dal roster di ${roster.teamCode}`, lines: ["Non resterà tra i giocatori tagliati.", ...lines] };
  if (kind === "cut") return { title: `${row.name} sarà tagliato da ${roster.teamCode}`, lines: [`Il contratto da ${roster.cost} crediti continuerà a pesare fino alla scadenza ${roster.contract}.`, ...lines] };
  if (kind === "price") return { title: `Prezzo di ${row.name}: ${roster.cost} → ${newPrice}`, lines };
  return {
    title: `${row.name}: ${slotLabel(roster.slot)} → ${slotLabel(newSlot)}`,
    lines: [
      ...(exchangePlayer ? [`${exchangePlayer.name}: ${slotLabel(newSlot)} → ${slotLabel(roster.slot)}`] : []),
      ...(newSlot !== "regular" && roster.contract !== "T.O." ? [`Contratto di ${row.name}: ${roster.contract} → T.O.`] : []),
      ...(exchangePlayer?.roster && roster.slot !== "regular" && exchangePlayer.roster.contract !== "T.O." ? [`Contratto di ${exchangePlayer.name}: ${exchangePlayer.roster.contract} → T.O.`] : []),
      ...lines,
    ],
  };
}

function AuctionStatus({ row }: { row: AuctionRow }) {
  if (row.roster) return <span className="player-status player-status-roster">{row.roster.teamCode}</span>;
  if (row.qualifying) return <span className="player-status player-status-highlight"><strong>Q.O.</strong><small>{row.qualifying.teamCode}</small></span>;
  return <span className="player-status player-status-highlight"><strong>FA</strong></span>;
}

function ModalHeader({ row, label, onClose }: { row: AuctionRow; label: string; onClose: () => void }) {
  return <div className="auction-modal-header">
    <div><span>{label}</span><strong>{row.name}</strong><small>{row.role} · {row.realTeam || "Squadra reale non indicata"}</small></div>
    <button type="button" onClick={onClose} aria-label="Chiudi">×</button>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="auction-field"><span>{label}</span>{children}</label>;
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function CutPlayerCheck({ names }: { names: string[] }) {
  return <p className="manual-cut-check">Verifica manualmente che il giocatore acquisito non compaia tra i tagliati: {names.length ? names.join(" · ") : "nessun giocatore tagliato"}.</p>;
}

function formatTeamName(name: string) {
  return name.toLocaleLowerCase("it-IT").replace(/(^|[\s'-])\p{L}/gu, (letter) => letter.toLocaleUpperCase("it-IT"));
}

function slotLabel(slot: "regular" | "two_way" | "g_league" | "dpe") {
  if (slot === "two_way") return "Two-way";
  if (slot === "g_league") return "G-League";
  if (slot === "dpe") return "DPE";
  return "Roster";
}

function seasonLabel(seasonName: string, distance: number) {
  const match = seasonName.match(/^(\d{4})\/(\d{2})$/);
  if (!match) return seasonName;
  const start = Number(match[1]) + distance;
  return `${start}/${String((start + 1) % 100).padStart(2, "0")}`;
}

type DialogProps = {
  row: AuctionRow;
  rows: AuctionRow[];
  teams: AuctionTeam[];
  phase: string;
  seasonName: string;
  onClose: () => void;
};
