"use client";

import { useActionState, useState } from "react";
import {
  aggregateHistoryNames,
  defaultHistoryEntryContent,
  emptyHistoryBracketMatch,
  emptyHistoryContentFromTemplate,
  manuallyEditableHistoryNames,
  type HistoryBracketContent,
  type HistoryBracketSlot,
  type HistoryCompetitionEntry,
  type HistoryCompetitionMap,
  type HistoryCompetitionName,
  type HistoryDraftContent,
  type HistoryEntryContent,
  type HistoryHonoursContent,
  type HistoryRankingContent,
  type HistoryTitleCountsContent,
  type HistoryWinningRosterContent,
} from "@/lib/history-competitions";
import { saveHistoryCompetition, type HistorySaveState } from "./actions";
import { HomepageFeatureToggle } from "@/components/home-feature-toggle";

const initialState: HistorySaveState = {};
const createSeasonValue = "__create_new_season__";

export function HistoryEditor({ competitions, homepageHonoursTable }: { competitions: HistoryCompetitionMap; homepageHonoursTable: string }) {
  const [category, setCategory] = useState<HistoryCompetitionName>(manuallyEditableHistoryNames[0]);
  const [drafts, setDrafts] = useState<HistoryCompetitionMap>(competitions);
  const [selectedHomepageHonoursTable, setSelectedHomepageHonoursTable] = useState(homepageHonoursTable);
  return (
    <>
      <div className="content-editor-selectors single">
        <label><span>Contenuto</span><select value={category} onChange={(event) => setCategory(event.target.value as HistoryCompetitionName)}>{manuallyEditableHistoryNames.map((name) => <option value={name} key={name}>{name}</option>)}</select></label>
      </div>
      <HistoryCategoryForm
        category={category}
        entries={drafts[category]}
        onChange={(entries) => setDrafts((value) => ({ ...value, [category]: entries }))}
        homepageHonoursTable={selectedHomepageHonoursTable}
        onHomepageHonoursTableChange={(value) => setSelectedHomepageHonoursTable(value ?? "")}
        key={category}
      />
    </>
  );
}

function HistoryCategoryForm({
  category,
  entries,
  onChange,
  homepageHonoursTable,
  onHomepageHonoursTableChange,
}: {
  category: HistoryCompetitionName;
  entries: HistoryCompetitionEntry[];
  onChange: (entries: HistoryCompetitionEntry[]) => void;
  homepageHonoursTable: string;
  onHomepageHonoursTableChange: (value: string | null) => void;
}) {
  const aggregate = aggregateHistoryNames.has(category);
  const [state, action, pending] = useActionState(saveHistoryCompetition, initialState);
  const [selectedSeason, setSelectedSeason] = useState(entries[0]?.season ?? createSeasonValue);
  const [newSeason, setNewSeason] = useState("");
  const selected = entries.find((entry) => entry.season === selectedSeason);

  function updateSelected(content: HistoryEntryContent) {
    if (!selected) return;
    onChange(entries.map((entry) => entry.season === selected.season ? { ...entry, content } : entry));
  }

  function createSeason() {
    const season = newSeason.trim();
    if (!season) return;
    const existing = entries.find((entry) => entry.season.toLocaleLowerCase("it") === season.toLocaleLowerCase("it"));
    if (existing) {
      setSelectedSeason(existing.season);
      setNewSeason("");
      return;
    }
    const content = emptyHistoryContentFromTemplate(category, entries[0]?.content);
    onChange([{ season, content }, ...entries]);
    setSelectedSeason(season);
    setNewSeason("");
  }

  function removeSeason() {
    if (!selected || !window.confirm(`Eliminare l’annata ${selected.season}?`)) return;
    const next = entries.filter((entry) => entry.season !== selected.season);
    onChange(next);
    setSelectedSeason(next[0]?.season ?? createSeasonValue);
  }

  return (
    <form action={action} className="content-editor-form competition-editor-form history-editor-form">
      <input type="hidden" name="category" value={category} />
      <input type="hidden" name="entries_json" value={JSON.stringify(entries)} />
      {aggregate ? (
        <HistoryAggregateEditor category={category} entries={entries} onChange={onChange} homepageHonoursTable={homepageHonoursTable} onHomepageHonoursTableChange={onHomepageHonoursTableChange} />
      ) : (
        <>
          <div className="history-admin-toolbar history-season-toolbar">
            <label>
              <span>Annata</span>
              <select value={selected?.season ?? createSeasonValue} onChange={(event) => setSelectedSeason(event.target.value)}>
                {entries.map((entry) => <option value={entry.season} key={entry.season}>{entry.season}</option>)}
                <option value={createSeasonValue}>+ Crea nuova annata</option>
              </select>
            </label>
            {selected && <button className="history-remove-season" type="button" onClick={removeSeason}>Elimina annata</button>}
          </div>
          {!selected && (
            <div className="history-create-season">
              <label><span>Nome nuova annata</span><input autoFocus value={newSeason} onChange={(event) => setNewSeason(event.target.value)} placeholder="Formato AAAA/AA" /></label>
              <button type="button" onClick={createSeason} disabled={!newSeason.trim()}>Crea annata vuota</button>
            </div>
          )}
          {selected?.content.kind === "ranking" && <HistoryRankingEditor content={selected.content} onChange={updateSelected} />}
          {selected?.content.kind === "bracket" && <HistoryBracketEditor content={selected.content} onChange={updateSelected} />}
          {selected?.content.kind === "draft" && <HistoryDraftEditor content={selected.content} onChange={updateSelected} />}
          {selected?.content.kind === "winning_roster" && <HistoryWinningRosterEditor content={selected.content} onChange={updateSelected} />}
        </>
      )}
      {state.error && <p className="notice error">{state.error}</p>}
      {state.message && <p className="notice success">{state.message}</p>}
      <button className="button primary content-save-button" type="submit" disabled={pending}>{pending ? "Salvataggio…" : "Salva storico"}</button>
    </form>
  );
}

function HistoryRankingEditor({ content, onChange }: { content: HistoryRankingContent; onChange: (content: HistoryRankingContent) => void }) {
  function update(index: number, value: string) {
    const positions = [...content.positions];
    positions[index] = value;
    onChange({ ...content, positions });
  }
  return (
    <>
      <div className="ranking-admin-table history-ranking-table">
        <div className="ranking-admin-head"><span>Pos.</span><span>Squadra</span><span></span></div>
        {content.positions.map((teamName, index) => (
          <div className="ranking-admin-row history-ranking-row" key={index}>
            <strong className="standing-position">{index + 1}</strong>
            <input value={teamName} onChange={(event) => update(index, event.target.value)} placeholder="Scrivi il nome della squadra" />
            <button type="button" onClick={() => onChange({ ...content, positions: content.positions.filter((_, row) => row !== index) })} aria-label="Elimina posizione">×</button>
          </div>
        ))}
      </div>
      <button className="history-add-row" type="button" onClick={() => onChange({ ...content, positions: [...content.positions, ""] })}>+ Aggiungi posizione</button>
    </>
  );
}

function HistoryDraftEditor({ content, onChange }: { content: HistoryDraftContent; onChange: (content: HistoryDraftContent) => void }) {
  function update(index: number, field: keyof HistoryDraftContent["rows"][number], value: string) {
    onChange({ ...content, rows: content.rows.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row) });
  }
  return (
    <>
      <div className="history-grid-table history-draft-editor">
        <div className="history-grid-head"><span>Scelta</span><span>Squadra</span><span>Giocatore</span><span></span></div>
        {content.rows.map((row, index) => <div className="history-grid-row" key={index}>
          <input value={row.pick} onChange={(event) => update(index, "pick", event.target.value)} />
          <input value={row.team} onChange={(event) => update(index, "team", event.target.value)} placeholder="Squadra" />
          <input value={row.player} onChange={(event) => update(index, "player", event.target.value)} placeholder="Giocatore" />
          <button type="button" onClick={() => onChange({ ...content, rows: content.rows.filter((_, rowIndex) => rowIndex !== index) })}>×</button>
        </div>)}
      </div>
      <button className="history-add-row" type="button" onClick={() => onChange({ ...content, rows: [...content.rows, { pick: String(content.rows.length + 1), team: "", player: "" }] })}>+ Aggiungi riga</button>
    </>
  );
}

function HistoryWinningRosterEditor({ content, onChange }: { content: HistoryWinningRosterContent; onChange: (content: HistoryWinningRosterContent) => void }) {
  function updatePlayer(index: number, value: string) {
    const players = [...content.players];
    players[index] = value;
    onChange({ ...content, players });
  }
  return (
    <div className="history-winning-editor">
      <label><span>Squadra campione</span><input value={content.teamName} onChange={(event) => onChange({ ...content, teamName: event.target.value })} /></label>
      <div className="history-player-rows">{content.players.map((player, index) => <div key={index}><input value={player} onChange={(event) => updatePlayer(index, event.target.value)} placeholder={`Giocatore ${index + 1}`} /><button type="button" onClick={() => onChange({ ...content, players: content.players.filter((_, row) => row !== index) })}>×</button></div>)}</div>
      <button className="history-add-row" type="button" onClick={() => onChange({ ...content, players: [...content.players, ""] })}>+ Aggiungi giocatore</button>
    </div>
  );
}

function HistoryAggregateEditor({ category, entries, onChange, homepageHonoursTable, onHomepageHonoursTableChange }: { category: HistoryCompetitionName; entries: HistoryCompetitionEntry[]; onChange: (entries: HistoryCompetitionEntry[]) => void; homepageHonoursTable: string; onHomepageHonoursTableChange: (value: string | null) => void }) {
  function updateEntry(index: number, entry: HistoryCompetitionEntry) {
    onChange(entries.map((value, entryIndex) => entryIndex === index ? entry : value));
  }
  return (
    <>
      <div className="history-aggregate-stack">{entries.map((entry, index) => (
        <section className="history-aggregate-card" key={index}>
          <div className="history-aggregate-head"><input value={entry.season} onChange={(event) => updateEntry(index, { ...entry, season: event.target.value })} />{category === "Albo d'oro" && <HomepageFeatureToggle kind="honours" value={entry.season} selected={homepageHonoursTable === entry.season} onSelectionChange={onHomepageHonoursTableChange} />}<button type="button" onClick={() => onChange(entries.filter((_, entryIndex) => entryIndex !== index))}>×</button></div>
          {entry.content.kind === "honours" && <HonoursRows content={entry.content} onChange={(content) => updateEntry(index, { ...entry, content })} />}
          {entry.content.kind === "title_counts" && <TitleCountRows content={entry.content} onChange={(content) => updateEntry(index, { ...entry, content })} />}
        </section>
      ))}</div>
      <button className="history-add-row" type="button" onClick={() => onChange([...entries, { season: `Nuova tabella ${entries.length + 1}`, content: defaultHistoryEntryContent(category) }])}>+ Aggiungi tabella</button>
    </>
  );
}

function HonoursRows({ content, onChange }: { content: HistoryHonoursContent; onChange: (content: HistoryHonoursContent) => void }) {
  function update(index: number, field: keyof HistoryHonoursContent["rows"][number], value: string) {
    onChange({ ...content, rows: content.rows.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row) });
  }
  return <><div className="history-grid-table honours"><div className="history-grid-head"><span>Annata</span><span>Squadra</span><span>Proprietari</span><span></span></div>{content.rows.map((row, index) => <div className="history-grid-row" key={index}><input value={row.season} onChange={(event) => update(index, "season", event.target.value)} /><input value={row.team} onChange={(event) => update(index, "team", event.target.value)} /><input value={row.owners} onChange={(event) => update(index, "owners", event.target.value)} /><button type="button" onClick={() => onChange({ ...content, rows: content.rows.filter((_, rowIndex) => rowIndex !== index) })}>×</button></div>)}</div><button className="history-add-row" type="button" onClick={() => onChange({ ...content, rows: [...content.rows, { season: "", team: "", owners: "" }] })}>+ Aggiungi riga</button></>;
}

function TitleCountRows({ content, onChange }: { content: HistoryTitleCountsContent; onChange: (content: HistoryTitleCountsContent) => void }) {
  function update(index: number, field: keyof HistoryTitleCountsContent["rows"][number], value: string) {
    onChange({ ...content, rows: content.rows.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row) });
  }
  return <><div className="history-grid-table titles"><div className="history-grid-head"><span>Nome</span><span>Totale</span><span></span></div>{content.rows.map((row, index) => <div className="history-grid-row" key={index}><input value={row.label} onChange={(event) => update(index, "label", event.target.value)} /><input value={row.count} onChange={(event) => update(index, "count", event.target.value)} /><button type="button" onClick={() => onChange({ ...content, rows: content.rows.filter((_, rowIndex) => rowIndex !== index) })}>×</button></div>)}</div><button className="history-add-row" type="button" onClick={() => onChange({ ...content, rows: [...content.rows, { label: "", count: "" }] })}>+ Aggiungi riga</button></>;
}

function HistoryBracketEditor({ content, onChange }: { content: HistoryBracketContent; onChange: (content: HistoryBracketContent) => void }) {
  function updateStage(stageIndex: number, updater: (stage: HistoryBracketContent["stages"][number]) => HistoryBracketContent["stages"][number]) { onChange({ ...content, stages: content.stages.map((stage, index) => index === stageIndex ? updater(stage) : stage) }); }
  function resizeStage(stageIndex: number, count: number) { updateStage(stageIndex, (stage) => ({ ...stage, matches: count > stage.matches.length ? [...stage.matches, ...Array.from({ length: count - stage.matches.length }, emptyHistoryBracketMatch)] : stage.matches.slice(0, count) })); }
  function moveStage(stageIndex: number, direction: -1 | 1) { const destination = stageIndex + direction; if (destination < 0 || destination >= content.stages.length) return; const stages = [...content.stages]; [stages[stageIndex], stages[destination]] = [stages[destination], stages[stageIndex]]; onChange({ ...content, stages }); }
  function updateSlot(stageIndex: number, matchIndex: number, teamIndex: 0 | 1, patch: Partial<HistoryBracketSlot>) { updateStage(stageIndex, (stage) => ({ ...stage, matches: stage.matches.map((match, index) => { if (index !== matchIndex) return match; const teams: [HistoryBracketSlot, HistoryBracketSlot] = [match.teams[0], match.teams[1]]; teams[teamIndex] = { ...teams[teamIndex], ...patch }; return { ...match, teams }; }) })); }
  return <><div className="bracket-admin-stages">{content.stages.map((stage, stageIndex) => <section className="bracket-admin-stage" key={stageIndex}><div className="bracket-admin-stage-head"><label><span>Nome colonna</span><input value={stage.name} onChange={(event) => updateStage(stageIndex, (value) => ({ ...value, name: event.target.value }))} /></label><label><span>Incontri</span><select value={stage.matches.length} onChange={(event) => resizeStage(stageIndex, Number(event.target.value))}>{Array.from({ length: 16 }, (_, index) => index + 1).map((count) => <option value={count} key={count}>{count}</option>)}</select></label><div className="bracket-stage-actions"><button type="button" onClick={() => moveStage(stageIndex, -1)} disabled={stageIndex === 0}>←</button><button type="button" onClick={() => moveStage(stageIndex, 1)} disabled={stageIndex === content.stages.length - 1}>→</button><button className="remove" type="button" onClick={() => onChange({ ...content, stages: content.stages.filter((_, index) => index !== stageIndex) })} disabled={content.stages.length === 1}>×</button></div></div><div className="bracket-admin-matches">{stage.matches.map((match, matchIndex) => <article className="bracket-admin-match" key={matchIndex}><span>Incontro {matchIndex + 1}</span>{([0, 1] as const).map((teamIndex) => { const slot = match.teams[teamIndex]; return <div className="bracket-admin-team history-bracket-team" key={teamIndex}><input className="history-team-name" value={slot.teamName} onChange={(event) => updateSlot(stageIndex, matchIndex, teamIndex, { teamName: event.target.value })} placeholder="Nome squadra" /><input className="bracket-score-input" value={slot.score} onChange={(event) => updateSlot(stageIndex, matchIndex, teamIndex, { score: event.target.value })} placeholder="Punti" /><label className="home-advantage-toggle"><input type="checkbox" checked={slot.homeAdvantage} onChange={(event) => updateSlot(stageIndex, matchIndex, teamIndex, { homeAdvantage: event.target.checked })} /><span>Casa</span></label></div>; })}</article>)}</div></section>)}</div><button className="bracket-add-stage" type="button" onClick={() => onChange({ ...content, stages: [...content.stages, { name: "Nuovo turno", matches: [emptyHistoryBracketMatch()] }] })}>+ Aggiungi colonna</button></>;
}
