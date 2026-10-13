const successParams = [
  "updated",
  "playoff_updated",
  "reverted",
  "assigned",
  "imported",
  "aligned",
  "dates",
  "stepped",
  "advanced",
  "auction_export",
  "restored",
];

export function urlWithoutAdminSuccess(currentUrl: string): string | null {
  const url = new URL(currentUrl);
  let changed = false;
  for (const key of successParams) {
    if (!url.searchParams.has(key)) continue;
    url.searchParams.delete(key);
    changed = true;
  }
  return changed ? url.toString() : null;
}
