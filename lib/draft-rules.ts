export const firstRoundDraftPrices = [25, 21, 17, 14, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2] as const;

export function draftOverallPosition(value: string | number) {
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return null;
  const position = Number(text);
  return Number.isInteger(position) && position >= 1 && position <= 30 ? position : null;
}

export function draftPrice(position: number | null, round: string) {
  if (position === null) return null;
  const roundNumber = Number(round.match(/\d+/)?.[0]);
  if (roundNumber === 2) return 1;
  if (roundNumber === 1 && position <= 15) return firstRoundDraftPrices[position - 1] ?? null;
  return null;
}

export function compareDraftPicks(
  left: { round: string; originOrOverall: string | number },
  right: { round: string; originOrOverall: string | number },
) {
  const roundOrder = left.round.localeCompare(right.round, "it", { numeric: true });
  if (roundOrder) return roundOrder;
  const leftPosition = draftOverallPosition(left.originOrOverall);
  const rightPosition = draftOverallPosition(right.originOrOverall);
  if (leftPosition === null && rightPosition !== null) return -1;
  if (leftPosition !== null && rightPosition === null) return 1;
  if (leftPosition !== null && rightPosition !== null) return leftPosition - rightPosition;
  return String(left.originOrOverall).localeCompare(String(right.originOrOverall), "it");
}
