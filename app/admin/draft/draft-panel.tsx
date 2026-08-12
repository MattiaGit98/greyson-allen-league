"use client";

import { Fragment, useId, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import type { DraftAsset, PlayerListEntry } from "@/lib/league-types";
import {
  draftSlotAssignmentErrors,
  draftSlotLimits,
  type DraftDestinationSlot,
  type DraftSlotCounts,
} from "@/lib/draft-assignment";
import { draftOverallPosition } from "@/lib/draft-rules";
import { assignDraftPlayer } from "./actions";

type DraftPickRow = DraftAsset & {
  id: string;
  stateIndex: number;
  ownerName: string;
  price: number | null;
  slots: DraftSlotCounts;
  capSpace: number;
};

export function DraftPanel({
  draftYear,
  picks,
  players,
  assignedCount,
  expectedCount,
  draftOpen,
  orderFinalized,
}: {
  draftYear: number | null;
  picks: DraftPickRow[];
  players: PlayerListEntry[];
  assignedCount: number;
  expectedCount: number;
  draftOpen: boolean;
  orderFinalized: boolean;
}) {
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [destinations, setDestinations] = useState<Record<string, DraftDestinationSlot>>({});
  const [immediateExits, setImmediateExits] = useState<Record<string, boolean>>({});

  return (
    <div className="draft-panel">
      <div className="draft-panel-summary">
        <span>Draft <strong>{draftYear ?? "—"}</strong></span>
        <span>Completate <strong>{assignedCount}/{expectedCount || "—"}</strong></span>
      </div>

      {draftYear !== null && !orderFinalized && (
        <p className="notice draft-panel-notice">Il pannello si aprirà quando l’ordine del Draft {draftYear} sarà stato salvato ufficialmente in Posizioni Draft.</p>
      )}

      {!players.length && (
        <p className="notice draft-panel-notice">Nessun rookie disponibile nel listone.</p>
      )}
      <div className="draft-panel-table">
        <div className="draft-panel-head"><span>Scelta</span><span>Proprietario</span><span>Prezzo</span><span>Giocatore</span><span>Slot</span><span>Taglia/rilascia</span><span></span></div>
        {picks.map((pick, index) => {
          const selectedPlayer = selections[pick.id] ?? "";
          const immediateExit = immediateExits[pick.id] === true;
          const requestedDestination = destinations[pick.id] ?? "regular";
          const destination = immediateExit
            ? pick.price === 1 ? "immediate_release" : "immediate_cut"
            : requestedDestination;
          const slotErrors = pick.price === null ? [] : draftSlotAssignmentErrors({
            slot: destination,
            price: pick.price,
            counts: pick.slots,
          });
          const capAfter = pick.price === null || destination === "immediate_release" ? pick.capSpace : pick.capSpace - pick.price;
          const capWarning = Boolean(selectedPlayer) && pick.price !== null && capAfter < 0;
          const canAssign = draftOpen && Boolean(selectedPlayer) && pick.price !== null && !slotErrors.length;
          const position = draftOverallPosition(pick.originOrOverall);
          const startsRound = index === 0 || picks[index - 1]?.round !== pick.round;
          return (
            <Fragment key={pick.id}>
            {startsRound && <div className={`draft-panel-round-divider ${pick.round === "2° giro" ? "second-round" : "first-round"}`}><strong>{pick.round === "2° giro" ? "Secondo giro" : "Primo giro"}</strong></div>}
            <form action={assignDraftPlayer} className="draft-panel-row">
              <input type="hidden" name="pick_index" value={pick.stateIndex} />
              <input type="hidden" name="draft_year" value={pick.year} />
              <input type="hidden" name="destination_slot" value={requestedDestination} />
              <input type="hidden" name="immediate_exit" value={String(immediateExit)} />
              <div className="draft-panel-pick">
                {position !== null
                  ? <b>#{position}</b>
                  : <b className="unresolved">{pick.originOrOverall}</b>}
                <span>{pick.round}</span>
              </div>
              <div className="draft-panel-owner"><i>{pick.teamCode}</i><strong>{formatTeamName(pick.ownerName)}</strong></div>
              <div className={`draft-panel-price ${pick.price === null ? "unresolved" : ""}`}>
                <strong>{pick.price ?? "—"}</strong>
                {pick.price === null && <small>Da definire</small>}
              </div>
              <SearchableRookieSelect
                players={players}
                value={selectedPlayer}
                onChange={(value) => {
                  setSelections((current) => ({ ...current, [pick.id]: value }));
                  if (!value) setImmediateExits((current) => ({ ...current, [pick.id]: false }));
                }}
                disabled={!draftOpen || !players.length || pick.price === null}
                placeholder={pick.price === null
                  ? "Posizione da definire"
                  : players.length ? "Scrivi il nome del rookie…" : "Listone rookie non disponibile"}
              />
              <label className="draft-panel-slot-select">
                <span>Slot</span>
                <select value={requestedDestination} onChange={(event) => setDestinations((current) => ({ ...current, [pick.id]: event.target.value as DraftDestinationSlot }))} disabled={!draftOpen || pick.price === null || immediateExit}>
                  <option value="regular">Roster ({pick.slots.regular}/{draftSlotLimits.regular})</option>
                  <option value="two_way">Two-way ({pick.slots.two_way}/{draftSlotLimits.two_way})</option>
                  <option value="g_league">G-League ({pick.slots.g_league}/{draftSlotLimits.g_league})</option>
                </select>
              </label>
              <label className="draft-panel-immediate-exit">
                <input
                  type="checkbox"
                  checked={immediateExit}
                  disabled={!draftOpen || !selectedPlayer || pick.price === null}
                  onChange={(event) => setImmediateExits((current) => ({ ...current, [pick.id]: event.target.checked }))}
                />
                <span>{pick.price === 1 ? "Rilascia" : "Taglia"}</span>
              </label>
              <div className="draft-panel-actions">
                <DraftAssignButton enabled={canAssign} />
              </div>
              {selectedPlayer && slotErrors.map((error) => <p className="validation error draft-panel-row-message" key={error}>{error}</p>)}
              {capWarning && (
                <p className="validation warning draft-panel-row-message">Cap libero: {pick.capSpace} → {capAfter}. L’assegnazione al draft resta consentita.</p>
              )}
            </form>
            </Fragment>
          );
        })}
        {!picks.length && <p className="team-option-empty">Nessuna scelta residua per questo draft.</p>}
      </div>
    </div>
  );
}

function SearchableRookieSelect({
  players,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  players: PlayerListEntry[];
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  placeholder: string;
}) {
  const optionsId = useId();
  const [search, setSearch] = useState(value);
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("it-IT");
    return players.filter((player) => !normalized || player.name.toLocaleLowerCase("it-IT").includes(normalized));
  }, [players, search]);

  function selectPlayer(player: PlayerListEntry) {
    setSearch(player.name);
    onChange(player.name);
    setOpen(false);
  }

  function updateSearch(nextValue: string) {
    setSearch(nextValue);
    setOpen(true);
    const normalized = nextValue.trim().toLocaleLowerCase("it-IT");
    const exact = players.find((player) => player.name.toLocaleLowerCase("it-IT") === normalized);
    onChange(exact?.name ?? "");
  }

  return (
    <div className="draft-panel-player-select">
      <span>Giocatore</span>
      <input type="hidden" name="player_name" value={value} />
      <div
        className={`draft-player-combobox ${open ? "open" : ""}`}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
        }}
      >
        <input
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={optionsId}
          aria-label="Giocatore"
          autoComplete="off"
          value={search}
          disabled={disabled}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(event) => updateSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
            if (event.key === "Enter" && open && matches.length === 1) {
              event.preventDefault();
              selectPlayer(matches[0]);
            }
          }}
        />
        {open && !disabled && (
          <div className="draft-player-combobox-menu" id={optionsId} role="listbox">
            {matches.map((player) => (
              <button
                className={player.name === value ? "selected" : ""}
                type="button"
                role="option"
                aria-selected={player.name === value}
                onClick={() => selectPlayer(player)}
                key={player.name}
              >
                <strong>{player.name}</strong>
                <span>
                  <i className={`mini-role mini-role-${player.role.toLowerCase()}`}>{player.role}</i>
                  {player.realTeam && <small>{player.realTeam}</small>}
                </span>
              </button>
            ))}
            {!matches.length && <p>Nessun rookie trovato</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function DraftAssignButton({ enabled }: { enabled: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={!enabled || pending}>{pending ? "Salvataggio…" : "Assegna"}</button>;
}

function formatTeamName(name: string) {
  return name
    .toLocaleLowerCase("it-IT")
    .replace(/(^|[\s'-])\p{L}/gu, (letter) => letter.toLocaleUpperCase("it-IT"));
}
