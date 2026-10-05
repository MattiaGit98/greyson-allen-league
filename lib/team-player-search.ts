import type { QualifyingOfferRight, RosterEntry } from "./league-types";

export type TeamPlayerSearchMatch = {
  name: string;
  teamCode: string;
  section: "roster" | "two_way" | "g_league" | "dpe" | "qualifying_offer";
  slotLabel: string;
};

export function teamPlayerSearchMatches({
  query,
  rosterEntries,
  qualifyingOfferRights,
  includeQualifyingOffers,
}: {
  query: string;
  rosterEntries: readonly RosterEntry[];
  qualifyingOfferRights: readonly QualifyingOfferRight[];
  includeQualifyingOffers: boolean;
}): TeamPlayerSearchMatch[] {
  const normalizedQuery = normalizePlayerName(query);
  if (normalizedQuery.length < 3) return [];

  const activeEntries = rosterEntries.filter((entry) => entry.state === "active");
  const activeNames = new Set(activeEntries.map((entry) => normalizePlayerName(entry.name)));
  const rosterMatches: TeamPlayerSearchMatch[] = activeEntries
    .filter((entry) => normalizePlayerName(entry.name).includes(normalizedQuery))
    .map((entry) => ({
      name: entry.name,
      teamCode: entry.teamCode,
      section: entry.slot === "regular" ? "roster" : entry.slot,
      slotLabel: slotLabel(entry.slot),
    }));
  const qualifyingMatches: TeamPlayerSearchMatch[] = includeQualifyingOffers
    ? qualifyingOfferRights
      .filter((right) => (
        !activeNames.has(normalizePlayerName(right.playerName))
        && normalizePlayerName(right.playerName).includes(normalizedQuery)
      ))
      .map((right) => ({
        name: right.playerName,
        teamCode: right.teamCode,
        section: "qualifying_offer",
        slotLabel: "Q.O.",
      }))
    : [];

  return [...rosterMatches, ...qualifyingMatches]
    .sort((left, right) => left.name.localeCompare(right.name, "it") || left.teamCode.localeCompare(right.teamCode));
}

function slotLabel(slot: RosterEntry["slot"]) {
  if (slot === "two_way") return "Two-way";
  if (slot === "g_league") return "G-League";
  if (slot === "dpe") return "DPE";
  return "Roster";
}

function normalizePlayerName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("it-IT");
}
