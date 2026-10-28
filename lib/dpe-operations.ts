import type { RosterEntry } from "./league-types";
import { operationWindows, type LeagueMoment } from "./league-moments";
import { isUnresolvedTeamOption } from "./team-option-contract";

export function applyDpeActivation(input: {
  rosterEntries: RosterEntry[];
  teamCode: string;
  playerName: string;
  seasonName: string;
  leagueMoment: LeagueMoment;
}) {
  if (!operationWindows.dpeActivation(input.leagueMoment)) throw new Error("La finestra per esercitare la DPE non è aperta.");
  const targetIndex = input.rosterEntries.findIndex((entry) => (
    entry.teamCode === input.teamCode
    && entry.name === input.playerName
    && entry.state === "active"
  ));
  const target = input.rosterEntries[targetIndex];
  if (!target) throw new Error("Il giocatore non appartiene più al roster selezionato.");
  if (target.slot === "dpe") throw new Error("Il giocatore è già nella DPE.");
  if (isUnresolvedTeamOption(target, input.leagueMoment, input.seasonName)) throw new Error("Risolvi prima il contratto da rookie del giocatore.");

  const rosterEntries = input.rosterEntries.map((entry, index) => {
    if (index === targetIndex) {
      return {
        ...entry,
        slot: "dpe" as const,
        dpeAppliedSeasons: [...new Set([...(entry.dpeAppliedSeasons ?? []), input.seasonName])],
      };
    }
    return entry;
  });

  return rosterEntries;
}

export function applyEarlyDpeReintegration(input: {
  rosterEntries: RosterEntry[];
  teamCode: string;
  playerName: string;
  seasonName: string;
  leagueMoment: LeagueMoment;
}) {
  if (!operationWindows.dpeReintegration(input.leagueMoment)) throw new Error("La finestra per il reintegro anticipato dalla DPE non è aperta.");
  const targetIndex = input.rosterEntries.findIndex((entry) => (
    entry.teamCode === input.teamCode && entry.name === input.playerName
    && entry.state === "active" && entry.slot === "dpe"
  ));
  if (targetIndex < 0) throw new Error("Il giocatore non è più nella DPE della squadra selezionata.");
  const regularPlayers = input.rosterEntries.filter((entry) => (
    entry.teamCode === input.teamCode && entry.state === "active" && entry.slot === "regular"
  )).length;
  if (regularPlayers >= 15) throw new Error("Per il reintegro serve uno slot roster libero.");
  return input.rosterEntries.map((entry, index) => index === targetIndex ? {
    ...entry,
    slot: "regular" as const,
    dpeAppliedSeasons: [...new Set([...(entry.dpeAppliedSeasons ?? []), input.seasonName])],
  } : entry);
}
