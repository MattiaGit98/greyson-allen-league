import type { EditableLeagueState } from "./league-state";
import { numberPublicAvailablePlayers } from "./player-list-public-order";
import { seasonEndYear } from "./season-time";
import { isPendingContractAssignment } from "./team-option-contract";

export type PublicPlayerStatus = "fa" | "qo" | "roster" | "expiring" | "not_expiring" | "pending";

export type PublicPlayerListRow = {
  name: string;
  role: "G" | "A" | "C" | "X";
  realTeam: string;
  rookie: boolean;
  under23: boolean;
  listOrder: number;
  publicOrder: number | null;
  rosterTeamCode: string | null;
  rosterContract: string | null;
  qualifyingTeamCode: string | null;
  buyoutApplied: boolean;
};

export function buildPublicPlayerListRows(
  state: Pick<EditableLeagueState, "playerList" | "rosterEntries" | "qualifyingOfferRights">,
): PublicPlayerListRow[] {
  const activeRosterByName = new Map<string, (typeof state.rosterEntries)[number]>();
  const buyoutNames = new Set<string>();
  for (const entry of state.rosterEntries) {
    const name = normalizePlayerName(entry.name);
    if (entry.state === "active" && !activeRosterByName.has(name)) activeRosterByName.set(name, entry);
    if (entry.state === "cut" && entry.buyoutApplied === true) buyoutNames.add(name);
  }
  const qualifyingOfferByName = new Map<string, (typeof state.qualifyingOfferRights)[number]>();
  for (const right of state.qualifyingOfferRights) {
    const name = normalizePlayerName(right.playerName);
    if (!qualifyingOfferByName.has(name)) qualifyingOfferByName.set(name, right);
  }

  return numberPublicAvailablePlayers(state.playerList.map((player, index) => {
    const normalizedName = normalizePlayerName(player.name);
    const activeRoster = activeRosterByName.get(normalizedName);
    const qualifyingOffer = qualifyingOfferByName.get(normalizedName);
    return {
      ...player,
      listOrder: index + 1,
      rosterTeamCode: activeRoster?.teamCode ?? null,
      rosterContract: activeRoster?.contract ?? null,
      qualifyingTeamCode: activeRoster ? null : qualifyingOffer?.teamCode ?? null,
      buyoutApplied: buyoutNames.has(normalizedName),
    };
  }));
}

export function publicPlayerStatus(row: PublicPlayerListRow, seasonName: string, postAuction: boolean): PublicPlayerStatus {
  if (!row.rosterTeamCode) return row.qualifyingTeamCode ? "qo" : "fa";
  if (!postAuction) return "roster";
  const contract = row.rosterContract?.trim() ?? "";
  if (isPendingContractAssignment(contract)) return "pending";
  const endYear = seasonEndYear(seasonName);
  const shortYear = endYear === null ? null : String(endYear % 100).padStart(2, "0");
  return shortYear && (contract === shortYear || contract === `${shortYear} (Q)`)
    ? "expiring"
    : "not_expiring";
}

function normalizePlayerName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("it-IT");
}
