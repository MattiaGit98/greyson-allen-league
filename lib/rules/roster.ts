import { result } from "./types";

export type SlotCounts = { regular: number; twoWay: number; gLeague: number; dpe: number };

export function validateSlots(slots: SlotCounts) {
  const limits: SlotCounts = { regular: 15, twoWay: 2, gLeague: 3, dpe: 1 };
  const errors = (Object.keys(limits) as (keyof SlotCounts)[])
    .filter((key) => slots[key] > limits[key])
    .map((key) => ({ code: `SLOT_${key.toUpperCase()}_FULL`, message: `Superato il limite per lo slot ${key}.` }));
  return result({ total: Object.values(slots).reduce((a, b) => a + b, 0) }, ["2(a)"], errors);
}

export function validateRoleMinimums(roles: { G: number; A: number; C: number }, inSeason: boolean) {
  if (!inSeason) return result({ missing: 0 }, ["2(b)"]);
  const minimums = { G: 5, A: 5, C: 3 };
  const errors = (Object.keys(minimums) as (keyof typeof minimums)[])
    .filter((role) => roles[role] < minimums[role])
    .map((role) => ({ code: `ROLE_${role}_MINIMUM`, message: `Servono almeno ${minimums[role]} giocatori di ruolo ${role}.` }));
  return result({ missing: errors.length }, ["2(b)"], errors);
}
