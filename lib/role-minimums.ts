import type { LeaguePhase, RosterEntry } from "./league-types";
import { hasReachedMoment, type LeagueMoment } from "./league-moments";
import { countRosterRoles } from "./rules/roster";

export type RoleMinimumShortage = { G: number; A: number; C: number; total: number };

export function roleMinimumChecksApply(phase: LeaguePhase, moment?: LeagueMoment) {
  if (moment) {
    return hasReachedMoment(moment, "auction_completed") && !hasReachedMoment(moment, "free_agency_end");
  }
  return phase === "regular_season";
}

export function roleMinimumShortage(entries: RosterEntry[], phase: LeaguePhase, moment?: LeagueMoment): RoleMinimumShortage {
  if (!roleMinimumChecksApply(phase, moment)) return { G: 0, A: 0, C: 0, total: 0 };
  const roles = countRosterRoles(entries
    .filter((entry) => entry.state === "active")
    .map((entry) => ({ role: entry.role, slot: entry.slot })));
  const G = Math.max(0, 5 - roles.G);
  const A = Math.max(0, 5 - roles.A);
  const C = Math.max(0, 3 - roles.C);
  return { G, A, C, total: G + A + C };
}

export function roleMinimumShortageMessage(shortage: RoleMinimumShortage) {
  const details = [shortage.G ? `${shortage.G} G` : "", shortage.A ? `${shortage.A} A` : "", shortage.C ? `${shortage.C} C` : ""]
    .filter(Boolean)
    .join(" · ");
  return `Dopo l'operazione va assegnato un free agent casuale da 1 credito per: ${details}.`;
}

export function roleMinimumsWorsen(before: RosterEntry[], after: RosterEntry[], phase: LeaguePhase, moment?: LeagueMoment) {
  const previous = roleMinimumShortage(before, phase, moment);
  const next = roleMinimumShortage(after, phase, moment);
  return next.G > previous.G || next.A > previous.A || next.C > previous.C;
}

export function roleMinimumRecoverySlotError(shortage: RoleMinimumShortage, slots: { regular: number; twoWay: number }) {
  const freeSlots = Math.max(0, 15 - slots.regular) + Math.max(0, 2 - slots.twoWay);
  return shortage.total > freeSlots
    ? `Servono ${shortage.total} slot tra roster e Two-way per ripristinare i minimi di ruolo, ma ne restano ${freeSlots}.`
    : null;
}

export function roleMinimumRecoverySlotErrorForEntries(entries: RosterEntry[], phase: LeaguePhase, moment?: LeagueMoment) {
  const slots = entries
    .filter((entry) => entry.state === "active")
    .reduce((counts, entry) => ({
      regular: counts.regular + Number(entry.slot === "regular"),
      twoWay: counts.twoWay + Number(entry.slot === "two_way"),
    }), { regular: 0, twoWay: 0 });
  return roleMinimumRecoverySlotError(roleMinimumShortage(entries, phase, moment), slots);
}
