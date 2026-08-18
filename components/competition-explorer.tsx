"use client";

import { useState } from "react";
import { BracketView, type BracketStage } from "@/components/bracket-view";
import {
  bracketUnknownTeamCode,
  competitionNames,
  formatCompetitionNumber,
  sortedCupTeams,
  type BracketContent,
  type CompetitionContent,
  type CompetitionContentMap,
  type CompetitionName,
  type CompetitionTeam,
  type CupGroupContent,
  type RankingContent,
} from "@/lib/competitions";

export function CompetitionExplorer({
  competitions,
  teams,
}: {
  competitions: CompetitionContentMap;
  teams: CompetitionTeam[];
}) {
  const [selectedName, setSelectedName] = useState<CompetitionName>(competitionNames[0]);
  const content = competitions[selectedName];

  return (
    <div className="public-content-with-index competition-explorer">
      <div className="public-content-main">
        <div className="public-content-mobile-selector">
          <Selector
            label="Competizione"
            value={selectedName}
            onChange={(value) => setSelectedName(value as CompetitionName)}
            options={[...competitionNames]}
          />
        </div>
        <CompetitionContentView content={content} teams={teams} />
      </div>
      <nav className="public-content-index" aria-label="Seleziona competizione">
        <span>Competizioni</span>
        {competitionNames.map((name) => (
          <button className={name === selectedName ? "active" : ""} type="button" onClick={() => setSelectedName(name)} key={name}>
            {name}
          </button>
        ))}
      </nav>
    </div>
  );
}

export function CompetitionContentView({ content, teams }: { content: CompetitionContent; teams: CompetitionTeam[] }) {
  if (content.kind === "bracket") {
    return <BracketView stages={publicBracketStages(content, teams)} />;
  }
  if (content.kind === "cup_group") return <CupStandings content={content} teams={teams} />;
  return <Ranking content={content} teams={teams} />;
}

function Ranking({ content, teams }: { content: RankingContent; teams: CompetitionTeam[] }) {
  const teamByCode = new Map(teams.map((team) => [team.code, team]));
  return (
    <div className="standings-card">
      <div className="standings-head"><span>Pos.</span><span>Squadra</span></div>
      {content.positions.map((code, index) => {
        const team = code ? teamByCode.get(code) : null;
        return (
          <article className="standings-row" key={index}>
            <strong className="standing-position">{index + 1}</strong>
            <strong className={team ? "" : "to-be-defined"}>{team?.name ?? "Da definire"}</strong>
          </article>
        );
      })}
    </div>
  );
}

function CupStandings({ content, teams }: { content: CupGroupContent; teams: CompetitionTeam[] }) {
  const rows = sortedCupTeams(content, teams);
  return (
    <div className="standings-card">
      <div className="standings-head cup">
        <span>Pos.</span><span>Squadra</span><span>V</span><span>Totale</span>
      </div>
      {rows.map(({ team, totals }, index) => (
        <article className="standings-row cup" key={team.code}>
          <strong className="standing-position">{index + 1}</strong>
          <strong>{team.name}</strong>
          <strong>{totals.wins}</strong>
          <strong>{formatCompetitionNumber(totals.score)}</strong>
        </article>
      ))}
    </div>
  );
}

function publicBracketStages(content: BracketContent, teams: CompetitionTeam[]): BracketStage[] {
  const teamByCode = new Map(teams.map((team) => [team.code, team]));
  return content.stages.map((stage) => ({
    name: stage.name,
    matches: stage.matches.map((match) => ({
      teams: match.teams.map((slot) => ({
        name: slot.teamCode === bracketUnknownTeamCode
          ? bracketUnknownTeamCode
          : slot.teamCode ? teamByCode.get(slot.teamCode)?.name ?? "" : "",
        score: slot.score,
        homeAdvantage: slot.homeAdvantage,
      })),
    })),
  }));
}

export function Selector({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="view-selector">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option value={option} key={option}>{option}</option>)}
      </select>
    </label>
  );
}
