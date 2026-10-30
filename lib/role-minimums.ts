import type { LeaguePhase, RosterEntry } from "./league-types";
import { hasReachedMoment, type LeagueMoment } from "./league-moments";
import { countRosterRoles, roleMinimumDeficits } from "./rules/roster";
import { getRosterSlotLimits, type SlotCapacityConfig } from "./roster-slot-limits";

export type RoleMinimumShortage = { G: number; A: number; C: number; total: number };

export function roleMinimumChecksApply(phase: LeaguePhase, moment?: LeagueMoment) {
  if (moment) {
    return hasReachedMoment(moment, "auction_completed");
  }
  return phase === "regular_season";
}

export function dpeCountsForRoleMinimums(moment?: LeagueMoment) {
  return Boolean(moment && hasReachedMoment(moment, "free_agency_reopening"));
}

export function roleMinimumShortage(entries: RosterEntry[], phase: LeaguePhase, moment?: LeagueMoment): RoleMinimumShortage {
  if (!roleMinimumChecksApply(phase, moment)) return { G: 0, A: 0, C: 0, total: 0 };
  const roles = countRosterRoles(entries
    .filter((entry) => entry.state === "active")
    .map((entry) => ({ role: entry.role, slot: entry.slot })), dpeCountsForRoleMinimums(moment));
  const { G, A, C } = roleMinimumDeficits(roles);
  return { G, A, C, total: G + A + C };
}

export function roleMinimumsWorsen(before: RosterEntry[], after: RosterEntry[], phase: LeaguePhase, moment?: LeagueMoment) {
  return roleMinimumAffectedTeamCodes(before, after).some((teamCode) => {
    const previous = roleMinimumShortage(before.filter((entry) => entry.teamCode === teamCode), phase, moment);
    const next = roleMinimumShortage(after.filter((entry) => entry.teamCode === teamCode), phase, moment);
    return next.G > previous.G || next.A > previous.A || next.C > previous.C;
  });
}

export function roleMinimumAffectedTeamCodes(before: RosterEntry[], after: RosterEntry[]) {
  const teamCodes = new Set([...before, ...after].map((entry) => entry.teamCode));
  return [...teamCodes].filter((teamCode) => (
    activeRoleRosterSnapshot(before, teamCode) !== activeRoleRosterSnapshot(after, teamCode)
  ));
}

export function roleMinimumRecoverySlotError(shortage: RoleMinimumShortage, slots: { regular: number; twoWay: number }, config: SlotCapacityConfig = {}) {
  const freeSlots = Math.max(0, 15 - slots.regular) + Math.max(0, getRosterSlotLimits(config).two_way - slots.twoWay);
  return shortage.total > freeSlots
    ? `Servono ${shortage.total} slot tra roster e Two-way per ripristinare i minimi di ruolo, ma ne restano ${freeSlots}.`
    : null;
}

export function roleMinimumRecoverySlotErrorForEntries(entries: RosterEntry[], phase: LeaguePhase, moment?: LeagueMoment, config: SlotCapacityConfig = {}) {
  const slots = entries
    .filter((entry) => entry.state === "active")
    .reduce((counts, entry) => ({
      regular: counts.regular + Number(entry.slot === "regular"),
      twoWay: counts.twoWay + Number(entry.slot === "two_way"),
    }), { regular: 0, twoWay: 0 });
  return roleMinimumRecoverySlotError(roleMinimumShortage(entries, phase, moment), slots, config);
}

function activeRoleRosterSnapshot(entries: RosterEntry[], teamCode: string) {
  return entries
    .filter((entry) => entry.teamCode === teamCode && entry.state === "active")
    .map((entry) => `${entry.name}\u0000${entry.role ?? ""}\u0000${entry.slot}`)
    .sort()
    .join("\u0001");
}
