import snapshot from "@/data/league-snapshot.json";

export type LeaguePhase = "offseason" | "auction" | "regular_season";
export type RosterEntry = {
  name: string;
  cost: number;
  contract: string;
  role?: "G" | "A" | "C";
  state: "active" | "cut";
  teamCode: string;
};
export type QualifyingOfferRight = {
  playerName: string;
  qualifyingAmount: number;
  teamCode: string;
};
export type DraftAsset = {
  label: string;
  round: string;
  year: number;
  originOrOverall: string | number;
  teamCode: string;
};
export type TeamSummary = {
  code: string;
  name: string;
  owner: string;
  credits: number;
  cost: number;
  players: number;
  cutPlayers: number;
  qualifyingOffers: number;
  draftAssets: number;
  slug: string;
};

export const rosterEntries = snapshot.rosterEntries as RosterEntry[];
export const qualifyingOfferRights = snapshot.qualifyingOfferRights as QualifyingOfferRight[];
export const draftAssets = snapshot.draftAssets as DraftAsset[];
export const season = snapshot.season as { name: string; phase: LeaguePhase };

export const teams: TeamSummary[] = snapshot.teams.map((team) => ({
  code: team.code,
  name: team.name,
  owner: team.owner,
  credits: team.currentCredits,
  cost: team.committedCost,
  players: rosterEntries.filter((entry) => entry.teamCode === team.code && entry.state === "active").length,
  cutPlayers: rosterEntries.filter((entry) => entry.teamCode === team.code && entry.state === "cut").length,
  qualifyingOffers: qualifyingOfferRights.filter((right) => right.teamCode === team.code).length,
  draftAssets: draftAssets.filter((asset) => asset.teamCode === team.code).length,
  slug: team.code.toLowerCase(),
})).sort((left, right) => left.name.localeCompare(right.name, "it"));

export function entriesForTeam(code: string) {
  return rosterEntries.filter((entry) => entry.teamCode === code);
}

export function parseContract(contract: string) {
  const value = String(contract);
  return {
    raw: value,
    isTeamOption: value === "T.O.",
    hasQualifyingRight: value.includes("(Q)"),
    isExtended: value.includes("(E)"),
    expiry: value.match(/\d{2}/)?.[0] ?? null,
  };
}
