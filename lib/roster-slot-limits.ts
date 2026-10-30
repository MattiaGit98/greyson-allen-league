import type { RosterEntry } from "./league-types";

export type SlotCapacityConfig = { twoWaySlotLimit?: number };
export const futureTwoWaySlotLimit = 3;

export const rosterSlotLimits = {
  regular: 15,
  two_way: 2,
  g_league: 3,
  dpe: Number.POSITIVE_INFINITY,
} as const;

/** I backup precedenti alla configurazione esplicita avevano due slot Two-way. */
export function getRosterSlotLimits(config: SlotCapacityConfig = {}) {
  const twoWay = config.twoWaySlotLimit === undefined ? 2 : config.twoWaySlotLimit;
  if (twoWay !== 2 && twoWay !== 3) throw new Error("Limite degli slot Two-way non valido.");
  return { ...rosterSlotLimits, two_way: twoWay };
}

export type RosterSlot = keyof typeof rosterSlotLimits;
export type RosterSlotCounts = Record<RosterSlot, number>;

export type RosterSlotOverflow = {
  teamCode: string;
  slot: RosterSlot;
  count: number;
  limit: number;
};

export function countActiveRosterSlots(entries: RosterEntry[], teamCode: string): RosterSlotCounts {
  return entries.reduce<RosterSlotCounts>((counts, entry) => {
    if (entry.teamCode === teamCode && entry.state === "active") counts[entry.slot] += 1;
    return counts;
  }, { regular: 0, two_way: 0, g_league: 0, dpe: 0 });
}

export function findTeamSlotOverflows(entries: RosterEntry[], teamCode: string, config: SlotCapacityConfig = {}): RosterSlotOverflow[] {
  const limits = getRosterSlotLimits(config);
  const counts = countActiveRosterSlots(entries, teamCode);
  return (Object.keys(rosterSlotLimits) as RosterSlot[]).flatMap((slot) => (
    counts[slot] > limits[slot]
      ? [{ teamCode, slot, count: counts[slot], limit: limits[slot] }]
      : []
  ));
}

export function findAllSlotOverflows(entries: RosterEntry[], teamCodes?: Iterable<string>, config: SlotCapacityConfig = {}) {
  const codes = teamCodes
    ? [...new Set(teamCodes)]
    : [...new Set(entries.map((entry) => entry.teamCode))];
  return codes.flatMap((teamCode) => findTeamSlotOverflows(entries, teamCode, config));
}

export function changedSlotTeamCodes(before: RosterEntry[], after: RosterEntry[]) {
  const codes = new Set([...before, ...after].map((entry) => entry.teamCode));
  return [...codes].filter((teamCode) => {
    const beforeCounts = countActiveRosterSlots(before, teamCode);
    const afterCounts = countActiveRosterSlots(after, teamCode);
    return (Object.keys(rosterSlotLimits) as RosterSlot[])
      .some((slot) => beforeCounts[slot] !== afterCounts[slot]);
  });
}

export function slotOverflowMessage(overflow: RosterSlotOverflow) {
  return `${overflow.teamCode}: slot ${rosterSlotLabel(overflow.slot)} oltre il limite (${overflow.count}/${overflow.limit}).`;
}

export function rosterSlotLabel(slot: RosterSlot) {
  if (slot === "two_way") return "Two-way";
  if (slot === "g_league") return "G-League";
  if (slot === "dpe") return "DPE";
  return "Roster";
}
