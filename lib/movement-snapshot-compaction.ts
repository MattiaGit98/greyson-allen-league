const compactCollections = [
  "rosterEntries",
  "draftAssets",
  "qualifyingOfferRights",
  "playerList",
] as const;

type Snapshot = Record<string, unknown>;

/** Keeps the entries needed by movement reversal, without changing stored rows. */
export function compactMovementSnapshotsForBackup<T extends { before_state: Snapshot; after_state: Snapshot }>(movement: T): T {
  const before = { ...movement.before_state };
  const after = { ...movement.after_state };

  for (const collection of compactCollections) {
    const beforeEntries = before[collection];
    const afterEntries = after[collection];
    if (!Array.isArray(beforeEntries) || !Array.isArray(afterEntries)) continue;

    const beforeGroups = groupEntries(beforeEntries, collection);
    const afterGroups = groupEntries(afterEntries, collection);
    const keys = new Set([...beforeGroups.keys(), ...afterGroups.keys()]);
    const changed = new Set([...keys].filter((key) => (
      stableDiffJson(beforeGroups.get(key) ?? []) !== stableDiffJson(afterGroups.get(key) ?? [])
    )));

    before[collection] = beforeEntries.filter((entry) => changed.has(entryKey(entry, collection)));
    after[collection] = afterEntries.filter((entry) => changed.has(entryKey(entry, collection)));
  }

  return { ...movement, before_state: before, after_state: after };
}

function groupEntries(entries: unknown[], collection: typeof compactCollections[number]) {
  const groups = new Map<string, unknown[]>();
  for (const entry of entries) {
    const key = entryKey(entry, collection);
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }
  return groups;
}

function entryKey(entry: unknown, collection: typeof compactCollections[number]) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return `unknown:${stableDiffJson(entry)}`;
  const record = entry as Record<string, unknown>;
  if (collection === "draftAssets") {
    const origin = record.originTeamCode ?? record.originOrOverall;
    if (origin != null && record.year != null && record.round != null) {
      return `${record.year}|${record.round}|${origin}`;
    }
  } else {
    const name = collection === "qualifyingOfferRights" ? record.playerName : record.name;
    if (typeof name === "string" && name.trim()) return name.trim().toLocaleLowerCase("it-IT");
  }
  return `unknown:${stableDiffJson(entry)}`;
}

// Matches the order-insensitive comparison used by buildMovementReversal.
function stableDiffJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableDiffJson).sort().join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableDiffJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? String(value);
}
