export function draftOverallPosition(value: string | number) {
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return null;
  const position = Number(text);
  return Number.isSafeInteger(position) && position >= 1 ? position : null;
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
