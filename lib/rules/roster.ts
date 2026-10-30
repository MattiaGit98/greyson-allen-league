import { result } from "./types";
import { getRosterSlotLimits, type SlotCapacityConfig } from "../roster-slot-limits";

export type SlotCounts = { regular: number; twoWay: number; gLeague: number; dpe: number };
export type RoleCounts = { G: number; A: number; C: number };
export const roleMinimums: RoleCounts = { G: 5, A: 5, C: 3 };

export function roleMinimumDeficits(roles: RoleCounts): RoleCounts {
  return {
    G: Math.max(0, roleMinimums.G - roles.G),
    A: Math.max(0, roleMinimums.A - roles.A),
    C: Math.max(0, roleMinimums.C - roles.C),
  };
}

export function countRosterRoles(
  players: readonly { role: "G" | "A" | "C" | null | undefined; slot: "regular" | "two_way" | "g_league" | "dpe" }[],
  includeDpe = false,
): RoleCounts {
  return players.reduce<RoleCounts>((counts, player) => {
    if ((includeDpe || player.slot !== "dpe") && player.role) counts[player.role] += 1;
    return counts;
  }, { G: 0, A: 0, C: 0 });
}

export function validateSlots(slots: SlotCounts, config: SlotCapacityConfig = {}) {
  const rosterSlotLimits = getRosterSlotLimits(config);
  const limits: SlotCounts = { regular: rosterSlotLimits.regular, twoWay: rosterSlotLimits.two_way, gLeague: rosterSlotLimits.g_league, dpe: rosterSlotLimits.dpe };
  const errors = (Object.keys(limits) as (keyof SlotCounts)[])
    .filter((key) => slots[key] > limits[key])
    .map((key) => ({ code: `SLOT_${key.toUpperCase()}_FULL`, message: `Superato il limite per lo slot ${key}.` }));
  return result({ total: Object.values(slots).reduce((a, b) => a + b, 0) }, ["2(a)"], errors);
}

export function validateRoleMinimums(roles: RoleCounts, inSeason: boolean) {
  if (!inSeason) return result({ missing: 0 }, ["2(b)"]);
  const deficits = roleMinimumDeficits(roles);
  const errors = (Object.keys(roleMinimums) as (keyof RoleCounts)[])
    .filter((role) => deficits[role] > 0)
    .map((role) => ({ code: `ROLE_${role}_MINIMUM`, message: `Servono almeno ${roleMinimums[role]} giocatori di ruolo ${role}.` }));
  return result({ missing: deficits.G + deficits.A + deficits.C }, ["2(b)"], errors);
}
