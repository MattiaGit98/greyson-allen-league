"use client";

import { useActionState, useState } from "react";
import {
  bracketUnknownTeamCode,
  competitionNames,
  cupTeamResult,
  emptyBracketMatch,
  formatCompetitionNumber,
  sortedCupTeams,
  type BracketContent,
  type BracketTeamSlot,
  type CompetitionContent,
  type CompetitionContentMap,
  type CompetitionName,
  type CompetitionTeam,
  type CupGroupContent,
  type RankingContent,
} from "@/lib/competitions";
import { saveCompetitionContent, type ContentSaveState } from "./actions";
import { HomepageFeatureToggle } from "@/components/home-feature-toggle";

const initialState: ContentSaveState = {};

export function ContentEditor({
  competitions,
  teams,
  homepageCompetition,
}: {
  competitions: CompetitionContentMap;
  teams: CompetitionTeam[];
  homepageCompetition: CompetitionName | null;
}) {
  const [selectedName, setSelectedName] = useState<CompetitionName>(competitionNames[0]);
  const [drafts, setDrafts] = useState<CompetitionContentMap>(competitions);
  const [selectedHomepageCompetition, setSelectedHomepageCompetition] = useState<CompetitionName | null>(homepageCompetition);

  function updateContent(content: CompetitionContent) {
    setDrafts((current) => ({ ...current, [selectedName]: content }));
  }

  return (
    <>
      <div className="content-editor-selectors single">
        <label>
          <span>Contenuto</span>
          <select value={selectedName} onChange={(event) => setSelectedName(event.target.value as CompetitionName)}>
            {competitionNames.map((name) => <option value={name} key={name}>{name}</option>)}
          </select>
        </label>
        <HomepageFeatureToggle kind="competition" value={selectedName} selected={selectedHomepageCompetition === selectedName} onSelectionChange={(value) => setSelectedHomepageCompetition(value as CompetitionName | null)} />
      </div>
      <CompetitionForm
        name={selectedName}
        content={drafts[selectedName]}
        teams={teams}
        onChange={updateContent}
        key={selectedName}
      />
    </>
  );
}

function CompetitionForm({
  name,
  content,
  teams,
  onChange,
}: {
  name: CompetitionName;
  content: CompetitionContent;
  teams: CompetitionTeam[];
  onChange: (content: CompetitionContent) => void;
}) {
  const [state, action, pending] = useActionState(saveCompetitionContent, initialState);
  return (
    <form action={action} className="content-editor-form competition-editor-form">
      <input type="hidden" name="competition_name" value={name} />
      <input type="hidden" name="content_json" value={JSON.stringify(content)} />
      {content.kind === "ranking" && <RankingEditor content={content} teams={teams} onChange={onChange} />}
      {content.kind === "cup_group" && <CupGroupEditor content={content} teams={teams} onChange={onChange} />}
      {content.kind === "bracket" && <BracketEditor content={content} teams={teams} onChange={onChange} />}
      {state.error && <p className="notice error">{state.error}</p>}
      {state.message && <p className="notice success">{state.message}</p>}
      <button className="button primary content-save-button" type="submit" disabled={pending}>
        {pending ? "Salvataggio…" : "Salva modifiche"}
      </button>
    </form>
  );
}

function RankingEditor({
  content,
  teams,
  onChange,
}: {
  content: RankingContent;
  teams: CompetitionTeam[];
  onChange: (content: RankingContent) => void;
}) {
  const usedTeams = new Set(content.positions.filter((code): code is string => Boolean(code)));
  function updatePosition(index: number, value: string) {
    const positions = [...content.positions];
    positions[index] = value || null;
    onChange({ ...content, positions });
  }

  return (
    <div className="ranking-admin-table">
      <div className="ranking-admin-head"><span>Pos.</span><span>Squadra</span></div>
      {content.positions.map((code, index) => (
        <label className="ranking-admin-row" key={index}>
          <strong className="standing-position">{index + 1}</strong>
          <select value={code ?? ""} onChange={(event) => updatePosition(index, event.target.value)}>
            <option value="">Posizione vuota</option>
            {teams.map((team) => (
              <option value={team.code} disabled={usedTeams.has(team.code) && team.code !== code} key={team.code}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}

function CupGroupEditor({
  content,
  teams,
  onChange,
}: {
  content: CupGroupContent;
  teams: CompetitionTeam[];
  onChange: (content: CupGroupContent) => void;
}) {
  const ranking = sortedCupTeams(content, teams);
  const positionByCode = new Map(ranking.map((row, index) => [row.team.code, index + 1]));

  function updateResult(code: string, field: "wins" | "scores", round: number, value: string) {
    const result = cupTeamResult(content, code);
    if (field === "wins") result.wins[round] = value === "0" ? 0 : value === "1" ? 1 : null;
    else result.scores[round] = value;
    onChange({ ...content, results: { ...content.results, [code]: result } });
  }

  return (
    <div className="cup-admin-table">
      <div className="cup-admin-head">
        <span>Squadra</span><span>V</span><span>Totale</span>
        {Array.from({ length: content.rounds }, (_, index) => <span key={index}>G{index + 1}</span>)}
      </div>
      {teams.map((team) => {
        const result = cupTeamResult(content, team.code);
        const totals = ranking.find((row) => row.team.code === team.code)!.totals;
        return (
          <article className="cup-admin-row" key={team.code}>
            <div className="cup-admin-team">
              <strong className="standing-position">{positionByCode.get(team.code)}</strong>
              <b>{team.name}</b>
            </div>
            <strong className="cup-admin-total">{totals.wins}</strong>
            <strong className="cup-admin-total">{formatCompetitionNumber(totals.score)}</strong>
            {Array.from({ length: content.rounds }, (_, round) => (
              <div className="cup-round-inputs" key={round}>
                <b>G{round + 1}</b>
                <label><span>Vittoria</span><select value={result.wins[round] ?? ""} onChange={(event) => updateResult(team.code, "wins", round, event.target.value)}><option value="">—</option><option value="1">1</option><option value="0">0</option></select></label>
                <label><span>Punteggio</span><input inputMode="decimal" value={result.scores[round]} onChange={(event) => updateResult(team.code, "scores", round, event.target.value)} placeholder="—" /></label>
              </div>
            ))}
          </article>
        );
      })}
    </div>
  );
}

function BracketEditor({
  content,
  teams,
  onChange,
}: {
  content: BracketContent;
  teams: CompetitionTeam[];
  onChange: (content: BracketContent) => void;
}) {
  function updateStage(stageIndex: number, updater: (stage: BracketContent["stages"][number]) => BracketContent["stages"][number]) {
    onChange({
      ...content,
      stages: content.stages.map((stage, index) => index === stageIndex ? updater(stage) : stage),
    });
  }

  function resizeStage(stageIndex: number, count: number) {
    updateStage(stageIndex, (stage) => ({
      ...stage,
      matches: count > stage.matches.length
        ? [...stage.matches, ...Array.from({ length: count - stage.matches.length }, emptyBracketMatch)]
        : stage.matches.slice(0, count),
    }));
  }

  function moveStage(stageIndex: number, direction: -1 | 1) {
    const destination = stageIndex + direction;
    if (destination < 0 || destination >= content.stages.length) return;
    const stages = [...content.stages];
    [stages[stageIndex], stages[destination]] = [stages[destination], stages[stageIndex]];
    onChange({ ...content, stages });
  }

  function updateSlot(stageIndex: number, matchIndex: number, teamIndex: 0 | 1, patch: Partial<BracketTeamSlot>) {
    updateStage(stageIndex, (stage) => ({
      ...stage,
      matches: stage.matches.map((match, index) => {
        if (index !== matchIndex) return match;
        const teamsInMatch: [BracketTeamSlot, BracketTeamSlot] = [match.teams[0], match.teams[1]];
        teamsInMatch[teamIndex] = { ...teamsInMatch[teamIndex], ...patch };
        return { ...match, teams: teamsInMatch };
      }),
    }));
  }

  return (
    <>
      <div className="bracket-admin-stages">
        {content.stages.map((stage, stageIndex) => (
          <section className="bracket-admin-stage" key={stageIndex}>
            <div className="bracket-admin-stage-head">
              <label><span>Nome colonna</span><input value={stage.name} onChange={(event) => updateStage(stageIndex, (current) => ({ ...current, name: event.target.value }))} /></label>
              <label><span>Incontri</span><select value={stage.matches.length} onChange={(event) => resizeStage(stageIndex, Number(event.target.value))}>{Array.from({ length: 16 }, (_, index) => index + 1).map((count) => <option value={count} key={count}>{count}</option>)}</select></label>
              <div className="bracket-stage-actions">
                <button type="button" onClick={() => moveStage(stageIndex, -1)} disabled={stageIndex === 0} aria-label="Sposta colonna a sinistra">←</button>
                <button type="button" onClick={() => moveStage(stageIndex, 1)} disabled={stageIndex === content.stages.length - 1} aria-label="Sposta colonna a destra">→</button>
                <button className="remove" type="button" onClick={() => onChange({ ...content, stages: content.stages.filter((_, index) => index !== stageIndex) })} disabled={content.stages.length === 1} aria-label="Elimina colonna">×</button>
              </div>
            </div>
            <div className="bracket-admin-matches">
              {stage.matches.map((match, matchIndex) => (
                <article className="bracket-admin-match" key={matchIndex}>
                  <span>Incontro {matchIndex + 1}</span>
                  {([0, 1] as const).map((teamIndex) => {
                    const slot = match.teams[teamIndex];
                    const opponentCode = match.teams[teamIndex === 0 ? 1 : 0].teamCode;
                    return (
                      <div className="bracket-admin-team" key={teamIndex}>
                        <select value={slot.teamCode ?? ""} onChange={(event) => updateSlot(stageIndex, matchIndex, teamIndex, { teamCode: event.target.value || null })} aria-label={`Squadra ${teamIndex + 1}`}>
                          <option value="">Da definire</option>
                          <option value={bracketUnknownTeamCode}>X</option>
                          {teams.map((team) => <option value={team.code} disabled={team.code === opponentCode} key={team.code}>{team.name}</option>)}
                        </select>
                        <input className="bracket-score-input" value={slot.score} onChange={(event) => updateSlot(stageIndex, matchIndex, teamIndex, { score: event.target.value })} placeholder="Punti" aria-label={`Punteggio squadra ${teamIndex + 1}`} />
                        <label className="home-advantage-toggle"><input type="checkbox" checked={slot.homeAdvantage} onChange={(event) => updateSlot(stageIndex, matchIndex, teamIndex, { homeAdvantage: event.target.checked })} /><span>Casa</span></label>
                      </div>
                    );
                  })}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
      <button className="bracket-add-stage" type="button" onClick={() => onChange({ ...content, stages: [...content.stages, { name: "Nuovo turno", matches: [emptyBracketMatch()] }] })}>
        + Aggiungi colonna
      </button>
    </>
  );
}
