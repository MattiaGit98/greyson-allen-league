import type { HistoryCompetitionEntry, HistoryDraftRow } from "./history-competitions";
import type { DraftAsset } from "./league-types";
import { draftOverallPosition } from "./draft-rules";

export function initializeDraftHistory(
  entries: HistoryCompetitionEntry[],
  draftYear: number,
  draftAssets: DraftAsset[],
) {
  const season = String(draftYear);
  const assets = draftAssets.filter((asset) => asset.year === draftYear);
  const rowsByPosition = positionedAssets(assets);
  if (!rowsByPosition.size) throw new Error("L'ordine del Draft non contiene posizioni valide.");
  const rowCount = Math.max(...rowsByPosition.keys());
  const existingIndex = entries.findIndex((entry) => entry.season === season);
  const existing = existingIndex >= 0 ? entries[existingIndex] : null;
  if (existing && existing.content.kind !== "draft") throw new Error("Lo storico del Draft non è valido.");
  const existingRows = existing?.content.kind === "draft" ? existing.content.rows : [];

  const rows = Array.from({ length: rowCount }, (_, index): HistoryDraftRow => {
    const position = index + 1;
    const oldRow = existingRows.find((row) => draftOverallPosition(row.pick) === position);
    if (oldRow?.player.trim()) return oldRow;
    return {
      pick: String(position),
      team: rowsByPosition.get(position)?.teamCode ?? "",
      player: "",
    };
  });
  const nextEntry: HistoryCompetitionEntry = { season, content: { kind: "draft", rows } };
  return existingIndex >= 0
    ? entries.map((entry, index) => index === existingIndex ? nextEntry : entry)
    : [nextEntry, ...entries];
}

export function synchronizeUnassignedDraftOwners(
  entries: HistoryCompetitionEntry[],
  draftAssets: DraftAsset[],
  finalizedYears: number[],
) {
  const finalized = new Set(finalizedYears);
  let changed = false;
  const next = entries.map((entry) => {
    const year = Number(entry.season);
    if (!Number.isInteger(year) || !finalized.has(year) || entry.content.kind !== "draft") return entry;
    const assetsByPosition = positionedAssets(draftAssets.filter((asset) => asset.year === year));
    const rows = entry.content.rows.map((row) => {
      if (row.player.trim()) return row;
      const position = draftOverallPosition(row.pick);
      const owner = position === null ? "" : assetsByPosition.get(position)?.teamCode ?? "";
      if (owner === row.team) return row;
      changed = true;
      return { ...row, team: owner };
    });
    return { ...entry, content: { kind: "draft" as const, rows } };
  });
  return { entries: next, changed };
}

function positionedAssets(assets: DraftAsset[]) {
  const result = new Map<number, DraftAsset>();
  for (const asset of assets) {
    const position = draftOverallPosition(asset.originOrOverall);
    if (position !== null) result.set(position, asset);
  }
  return result;
}
