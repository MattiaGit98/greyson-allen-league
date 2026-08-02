import type { DraftAsset } from "./league-types";
import { draftRoundForPosition } from "./draft-positions";
import type { HistoryCompetitionEntry } from "./history-competitions";

type TeamIdentity = { code: string; name: string };

export function inferLegacyDraftOrigins({
  draftYear,
  positionCount,
  teams,
  draftAssets,
  regularSeasonEntries,
  playoffEntries,
}: {
  draftYear: number;
  positionCount: number;
  teams: TeamIdentity[];
  draftAssets: DraftAsset[];
  regularSeasonEntries: HistoryCompetitionEntry[];
  playoffEntries: HistoryCompetitionEntry[];
}) {
  const origins = new Map<number, string>();
  const teamCodes = new Set(teams.map((team) => team.code));
  const assets = draftAssets.filter((asset) => asset.year === draftYear);

  for (const asset of assets) {
    const position = numericPosition(asset.originOrOverall);
    if (position !== null && asset.originTeamCode && teamCodes.has(asset.originTeamCode)) {
      origins.set(position, asset.originTeamCode);
    }
  }

  if (positionCount !== teams.length * 2) return origins;
  const regularSeason = findSeasonEntry(regularSeasonEntries, draftYear);
  const playoff = findSeasonEntry(playoffEntries, draftYear);
  const regularOrder = regularSeason?.content.kind === "ranking"
    ? regularSeason.content.positions.map((name) => teamCodeForName(name, teams)).filter((code): code is string => Boolean(code))
    : [];

  if (regularOrder.length === teams.length && new Set(regularOrder).size === teams.length) {
    [...regularOrder].reverse().forEach((originTeamCode, index) => {
      origins.set(teams.length + index + 1, originTeamCode);
    });

    if (playoff?.content.kind === "bracket") {
      const semifinal = playoff.content.stages.find((stage) => normalize(stage.name).includes("semifinal"));
      const semifinalists = [...new Set((semifinal?.matches ?? [])
        .flatMap((match) => match.teams.map((slot) => teamCodeForName(slot.teamName, teams)))
        .filter((code): code is string => Boolean(code)))]
        .sort((left, right) => regularOrder.indexOf(right) - regularOrder.indexOf(left));
      const firstPosition = teams.length - semifinalists.length + 1;
      semifinalists.forEach((originTeamCode, index) => origins.set(firstPosition + index, originTeamCode));
    }
  }

  const unresolvedOwnPicks = new Set(assets.flatMap((asset) => {
    if (numericPosition(asset.originOrOverall) !== null) return [];
    const origin = String(asset.originTeamCode ?? asset.originOrOverall).trim().toUpperCase();
    return teamCodes.has(origin) ? [`${asset.round}:${origin}`] : [];
  }));
  for (const asset of assets) {
    const position = numericPosition(asset.originOrOverall);
    if (position === null || origins.has(position) || !teamCodes.has(asset.teamCode)) continue;
    const round = draftRoundForPosition(position, positionCount);
    const usedInRound = new Set([...origins]
      .filter(([otherPosition]) => draftRoundForPosition(otherPosition, positionCount) === round)
      .map(([, code]) => code));
    if (!usedInRound.has(asset.teamCode) && !unresolvedOwnPicks.has(`${asset.round}:${asset.teamCode}`)) {
      origins.set(position, asset.teamCode);
    }
  }

  return origins;
}

function findSeasonEntry(entries: HistoryCompetitionEntry[], draftYear: number) {
  return entries.find((entry) => {
    const years = entry.season.match(/\d{4}/g)?.map(Number) ?? [];
    if (years.includes(draftYear) && (years.length === 1 || years.includes(draftYear - 1))) return true;
    const compact = entry.season.replace(/\s/g, "");
    const previousShort = String(draftYear - 1).slice(-2);
    const currentShort = String(draftYear).slice(-2);
    return compact.includes(`${previousShort}/${currentShort}`) || compact.includes(`${previousShort}-${currentShort}`);
  });
}

function teamCodeForName(name: string, teams: TeamIdentity[]) {
  const requested = normalize(name);
  if (!requested) return null;
  const exact = teams.find((team) => normalize(team.name) === requested);
  if (exact) return exact.code;
  const withoutPlural = requested.replace(/s/g, "");
  const close = teams.filter((team) => {
    const candidate = normalize(team.name);
    return candidate.replace(/s/g, "") === withoutPlural
      || (candidate.length >= 8 && requested.length >= 8 && candidate.slice(0, 8) === requested.slice(0, 8));
  });
  return close.length === 1 ? close[0].code : null;
}

function numericPosition(value: string | number) {
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return null;
  const position = Number(text);
  return Number.isInteger(position) ? position : null;
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("it-IT")
    .replace(/[^a-z0-9]/g, "");
}
