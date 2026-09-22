import type { PlayerListEntry, QualifyingOfferRight, RosterEntry } from "./league-types";

/** I contratti tagliati restano voci autonome: non richiedono un nome nel nuovo listone. */
export function referencedPlayerNames(
  rosterEntries: RosterEntry[],
  qualifyingOfferRights: QualifyingOfferRight[],
) {
  const references = new Map<string, Set<string>>();
  const add = (name: string, reference: string) => {
    const current = references.get(name) ?? new Set<string>();
    current.add(reference);
    references.set(name, current);
  };
  rosterEntries.filter((entry) => entry.state === "active").forEach((entry) => {
    const placement = entry.slot === "two_way" ? "Two-way"
      : entry.slot === "g_league" ? "G-League"
      : entry.slot === "dpe" ? "DPE" : "roster";
    add(entry.name, `${entry.teamCode} · ${placement}`);
  });
  qualifyingOfferRights.forEach((right) => add(right.playerName, `${right.teamCode} · Q.O.`));
  return references;
}

export function alignActiveRosterEntries(
  entries: RosterEntry[],
  canonicalPlayer: (sourceName: string) => PlayerListEntry | undefined,
) {
  return entries.map((entry) => {
    if (entry.state === "cut") return entry;
    const target = canonicalPlayer(entry.name);
    if (!target) throw new Error(`Nessuna corrispondenza confermata per ${entry.name}.`);
    return { ...entry, name: target.name, role: target.role === "X" ? undefined : target.role };
  });
}

export function syncActiveRosterRoles(
  entries: RosterEntry[],
  roleForName: (name: string) => PlayerListEntry["role"] | undefined,
) {
  return entries.map((entry) => {
    if (entry.state === "cut") return entry;
    const role = roleForName(entry.name);
    return { ...entry, role: !role || role === "X" ? undefined : role };
  });
}
