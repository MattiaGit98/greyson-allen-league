"use client";

import { useMemo, useState } from "react";
import { CapForceControl } from "@/app/admin/cap-force-control";
import { salaryCapWarningsForSpaces } from "@/lib/cap-override";
import { entriesForDpeAdjustedCap } from "@/lib/dpe-rules";
import type { LeaguePhase, RosterEntry } from "@/lib/league-types";
import { countActiveRosterSlots, rosterSlotLimits } from "@/lib/roster-slot-limits";
import { normalizeRosterCorrectionContract } from "@/lib/roster-corrections";
import { calculateCapSpace, followingSeasonName } from "@/lib/season-time";
import { saveRosterCorrections } from "./actions";

type CorrectionEntry = RosterEntry & { sourceIndex: number };
type Draft = { cost: string; contract: string; remove: boolean };
type SortKey = "name" | "role" | "contract" | "cost";
type SortState = { key: SortKey; direction: "asc" | "desc" };
type GroupKey = RosterEntry["slot"] | "cut";

const groups: { key: GroupKey; label: string; limit?: number }[] = [
  { key: "regular", label: "Roster", limit: 15 },
  { key: "two_way", label: "Two-way", limit: 2 },
  { key: "g_league", label: "G-League", limit: 3 },
  { key: "dpe", label: "Disabled player exception", limit: 1 },
  { key: "cut", label: "Tagliati" },
];

export function RosterCorrectionPanel({
  teams,
  entries,
  seasonName,
  phase,
  countTeamOptions,
}: {
  teams: { code: string; name: string }[];
  entries: CorrectionEntry[];
  seasonName: string;
  phase: LeaguePhase;
  countTeamOptions: boolean;
}) {
  const [teamCode, setTeamCode] = useState(teams[0]?.code ?? "");
  const [drafts, setDrafts] = useState<Record<number, Draft>>(() => Object.fromEntries(
    entries.map((entry) => [entry.sourceIndex, {
      cost: String(entry.cost),
      contract: entry.contract,
      remove: false,
    }]),
  ));
  const [sort, setSort] = useState<SortState>({ key: "cost", direction: "desc" });
  const [forceCap, setForceCap] = useState(false);
  const team = teams.find((item) => item.code === teamCode) ?? teams[0];
  const teamEntries = entries.filter((entry) => entry.teamCode === team?.code);
  const seasonNames = [0, 1, 2].map((distance) => followingSeasonName(seasonName, distance));

  const preview = useMemo(() => buildPreview({
    teamEntries,
    drafts,
    teamCode: team?.code ?? "",
    seasonNames,
    seasonName,
    phase,
    countTeamOptions,
  }), [teamEntries, drafts, team?.code, seasonNames, seasonName, phase, countTeamOptions]);

  const changeSort = (key: SortKey) => {
    setSort((current) => current.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: key === "cost" ? "desc" : "asc" });
  };
  const updateDraft = (sourceIndex: number, patch: Partial<Draft>) => {
    setDrafts((current) => ({ ...current, [sourceIndex]: { ...current[sourceIndex], ...patch } }));
    setForceCap(false);
  };

  if (!team) return <p className="notice error">Non ci sono squadre disponibili.</p>;

  return (
    <form action={saveRosterCorrections} className="roster-correction-form">
      <input type="hidden" name="team_code" value={team.code} />
      <input type="hidden" name="corrections_json" value={JSON.stringify(preview.corrections)} />
      <input type="hidden" name="force_cap" value={String(forceCap)} />

      <div className="contract-format-legend" aria-label="Legenda formati contrattuali">
        <strong>Legenda</strong>
        <span><b>XX</b>: scade nel 20XX</span>
        <span><b>T.O.</b>: team option</span>
        <span><b>XX (Q)</b>: scadenza con Q.O.</span>
        <span><b>XX (E)</b>: contratto estendibile</span>
        <span><b>XX (2X)</b>: costo raddoppiato nell’ultimo anno</span>
        <span><b>PENDING</b>: stato già presente per un contratto d’asta non pubblicato</span>
      </div>

      <label className="admin-team-select roster-correction-team-select">
        <span>Squadra</span>
        <select value={team.code} onChange={(event) => { setTeamCode(event.target.value); setForceCap(false); }}>
          {teams.map((item) => <option value={item.code} key={item.code}>{formatTeamName(item.name)}</option>)}
        </select>
      </label>

      <div className="team-accordion-content roster-correction-content">
        {groups.map((group) => {
          const rows = sortEntries(
            teamEntries.filter((entry) => placementOf(entry) === group.key),
            drafts,
            sort,
          );
          const activeCount = preview.projectedEntries.filter((entry) => placementOf(entry) === group.key).length;
          return (
            <section className="accordion-data-section roster-correction-section" key={group.key}>
              <p>{group.label} ({activeCount}{group.limit ? `/${group.limit}` : ""})</p>
              <div className="roster-correction-table">
                <div className="roster-correction-head">
                  <SortButton label="Giocatore" sortKey="name" sort={sort} onClick={changeSort} />
                  <SortButton label="Ruolo" sortKey="role" sort={sort} onClick={changeSort} />
                  <SortButton label="Scadenza" sortKey="contract" sort={sort} onClick={changeSort} />
                  <SortButton label="Costo" sortKey="cost" sort={sort} onClick={changeSort} />
                  <span>Rimuovi</span>
                </div>
                {rows.map((entry) => {
                  const draft = drafts[entry.sourceIndex];
                  const invalidContract = !draft.remove && normalizeRosterCorrectionContract(draft.contract) === null;
                  const invalidCost = !draft.remove && !validCost(draft.cost);
                  return (
                    <div className={`roster-correction-row ${draft.remove ? "removed" : ""}`} key={entry.sourceIndex}>
                      <strong>{entry.name}</strong>
                      <span><i className={`mini-role mini-role-${entry.role?.toLowerCase() ?? "none"}`}>{entry.role ?? "—"}</i></span>
                      <input
                        className={invalidContract ? "invalid" : ""}
                        value={draft.contract}
                        disabled={draft.remove}
                        onChange={(event) => updateDraft(entry.sourceIndex, { contract: event.target.value })}
                        aria-label={`Scadenza di ${entry.name}`}
                        aria-invalid={invalidContract}
                      />
                      <input
                        className={invalidCost ? "invalid" : ""}
                        type="number"
                        min="0"
                        step="1"
                        value={draft.cost}
                        disabled={draft.remove}
                        onChange={(event) => updateDraft(entry.sourceIndex, { cost: event.target.value })}
                        aria-label={`Costo di ${entry.name}`}
                        aria-invalid={invalidCost}
                      />
                      <button
                        className="roster-correction-remove"
                        type="button"
                        onClick={() => updateDraft(entry.sourceIndex, { remove: !draft.remove })}
                        aria-label={draft.remove ? `Ripristina ${entry.name}` : `Rimuovi ${entry.name}`}
                        title={draft.remove ? "Annulla rimozione" : "Rimuovi giocatore"}
                      >{draft.remove ? "↶" : "×"}</button>
                    </div>
                  );
                })}
                {!rows.length && <div className="data-empty">—</div>}
              </div>
            </section>
          );
        })}

        <section className="roster-correction-recap">
          <header>
            <span>Riepilogo prima del salvataggio</span>
            <strong>{preview.changedCount} modifiche · {preview.removedCount} rimozioni</strong>
          </header>
          <div className="roster-correction-metrics">
            {seasonNames.map((name, index) => (
              <Metric label={`Cap libero ${name}`} value={`${preview.spacesBefore[index]} → ${preview.spacesAfter[index]}`} key={name} />
            ))}
            <Metric label="Ruoli" value={`${preview.roles.G}/5 G · ${preview.roles.A}/5 A · ${preview.roles.C}/3 C`} />
            <Metric label="Slot" value={`${preview.slots.regular}/15 · ${preview.slots.two_way}/2 · ${preview.slots.g_league}/3 · ${preview.slots.dpe}/1`} />
          </div>
          {preview.errors.map((error) => <p className="validation error" key={error}>{error}</p>)}
          {preview.roleWarnings.map((warning) => <p className="validation warning" key={warning}>{warning}</p>)}
          <CapForceControl warnings={preview.capWarnings} checked={forceCap} onChange={setForceCap} />
          {!preview.errors.length && !preview.roleWarnings.length && !preview.capWarnings.length && (
            <p className="validation success">Salary cap, slot, ruoli e scadenze controllati.</p>
          )}
        </section>
      </div>

      <button
        className="button primary roster-correction-save"
        type="submit"
        disabled={preview.errors.length > 0 || preview.corrections.length === 0 || (preview.capWarnings.length > 0 && !forceCap)}
      >Salva rettifiche roster</button>
    </form>
  );
}

function buildPreview({
  teamEntries,
  drafts,
  teamCode,
  seasonNames,
  seasonName,
  phase,
  countTeamOptions,
}: {
  teamEntries: CorrectionEntry[];
  drafts: Record<number, Draft>;
  teamCode: string;
  seasonNames: string[];
  seasonName: string;
  phase: LeaguePhase;
  countTeamOptions: boolean;
}) {
  const errors: string[] = [];
  const corrections = teamEntries.flatMap((entry) => {
    const draft = drafts[entry.sourceIndex];
    const normalizedContract = normalizeRosterCorrectionContract(draft.contract);
    const initialContract = normalizeRosterCorrectionContract(entry.contract);
    if (!draft.remove && !normalizedContract) errors.push(`${entry.name}: scadenza “${draft.contract || "vuota"}” non riconosciuta.`);
    if (!draft.remove && normalizedContract === "PENDING" && initialContract !== "PENDING") {
      errors.push(`${entry.name}: non puoi assegnare PENDING a un contratto già pubblicato.`);
    }
    if (!draft.remove && !validCost(draft.cost)) errors.push(`${entry.name}: il costo deve essere un intero non negativo.`);
    const cost = Number(draft.cost);
    const changed = draft.remove || cost !== entry.cost || normalizedContract !== initialContract;
    return changed ? [{
      sourceIndex: entry.sourceIndex,
      playerName: entry.name,
      cost,
      contract: normalizedContract ?? draft.contract,
      remove: draft.remove,
    }] : [];
  });
  const projectedEntries = teamEntries.flatMap((entry): RosterEntry[] => {
    const draft = drafts[entry.sourceIndex];
    if (draft.remove) return [];
    return [{
      ...entry,
      cost: validCost(draft.cost) ? Number(draft.cost) : entry.cost,
      contract: normalizeRosterCorrectionContract(draft.contract) ?? entry.contract,
    }];
  });
  const spacesBefore = capSpaces(teamEntries, seasonNames, seasonName, countTeamOptions);
  const spacesAfter = capSpaces(projectedEntries, seasonNames, seasonName, countTeamOptions);
  const capWarnings = salaryCapWarningsForSpaces({ before: spacesBefore, after: spacesAfter, seasonNames, phase });
  const slots = countActiveRosterSlots(projectedEntries, teamCode);
  (Object.keys(rosterSlotLimits) as (keyof typeof rosterSlotLimits)[]).forEach((slot) => {
    if (slots[slot] > rosterSlotLimits[slot]) errors.push(`Slot ${slotLabel(slot)} oltre il limite: ${slots[slot]}/${rosterSlotLimits[slot]}.`);
  });
  const roles = projectedEntries
    .filter((entry) => entry.state === "active" && entry.slot !== "dpe")
    .reduce((counts, entry) => {
      if (entry.role) counts[entry.role] += 1;
      return counts;
    }, { G: 0, A: 0, C: 0 });
  const roleWarnings = phase === "regular_season"
    ? (["G", "A", "C"] as const).flatMap((role) => {
      const minimum = role === "C" ? 3 : 5;
      return roles[role] < minimum ? [`Minimo di ruolo ${role} non rispettato: ${roles[role]}/${minimum}.`] : [];
    })
    : [];
  return {
    corrections,
    projectedEntries,
    spacesBefore,
    spacesAfter,
    capWarnings: [...new Set(capWarnings)],
    slots,
    roles,
    errors: [...new Set(errors)],
    roleWarnings,
    removedCount: corrections.filter((correction) => correction.remove).length,
    changedCount: corrections.filter((correction) => !correction.remove).length,
  };
}

function capSpaces(entries: RosterEntry[], seasonNames: string[], optionSeasonName: string, countTeamOptions: boolean) {
  return seasonNames.map((name, distance) => calculateCapSpace({
    entries: entriesForDpeAdjustedCap(entries, distance),
    seasonName: name,
    optionSeasonName,
    countTeamOptions,
  }));
}

function sortEntries(entries: CorrectionEntry[], drafts: Record<number, Draft>, sort: SortState) {
  const direction = sort.direction === "asc" ? 1 : -1;
  return [...entries].sort((left, right) => {
    const leftDraft = drafts[left.sourceIndex];
    const rightDraft = drafts[right.sourceIndex];
    let comparison = 0;
    if (sort.key === "name") comparison = left.name.localeCompare(right.name, "it");
    if (sort.key === "role") comparison = roleOrder(left.role) - roleOrder(right.role);
    if (sort.key === "contract") comparison = contractOrder(leftDraft.contract) - contractOrder(rightDraft.contract);
    if (sort.key === "cost") comparison = Number(leftDraft.cost) - Number(rightDraft.cost);
    return comparison * direction || left.name.localeCompare(right.name, "it");
  });
}

function SortButton({ label, sortKey, sort, onClick }: { label: string; sortKey: SortKey; sort: SortState; onClick: (key: SortKey) => void }) {
  const active = sort.key === sortKey;
  return <button type="button" onClick={() => onClick(sortKey)}>{label}{active ? (sort.direction === "asc" ? " ↑" : " ↓") : ""}</button>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function validCost(value: string) {
  const cost = Number(value);
  return value.trim() !== "" && Number.isSafeInteger(cost) && cost >= 0;
}

function placementOf(entry: RosterEntry): GroupKey {
  return entry.state === "cut" ? "cut" : entry.slot;
}

function roleOrder(role: RosterEntry["role"]) {
  return role === "G" ? 0 : role === "A" ? 1 : role === "C" ? 2 : 3;
}

function contractOrder(contract: string) {
  if (contract.trim().toLocaleUpperCase("it-IT") === "T.O.") return 998;
  return Number(contract.match(/^\d{2}/)?.[0] ?? 999);
}

function slotLabel(slot: RosterEntry["slot"]) {
  if (slot === "two_way") return "Two-way";
  if (slot === "g_league") return "G-League";
  if (slot === "dpe") return "DPE";
  return "Roster";
}

function formatTeamName(name: string) {
  return name.toLocaleLowerCase("it-IT").replace(/(^|[\s'-])\p{L}/gu, (letter) => letter.toLocaleUpperCase("it-IT"));
}
