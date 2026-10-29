import { publicPlayerStatus, type PublicPlayerListRow, type PublicPlayerStatus } from "./public-player-list";

export type PublicPlayerCategory = "rookie" | "under23" | "veteran";

export function togglePlayerFilterSelection<T>(selected: readonly T[], value: T): T[] {
  return selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value];
}

export function matchesPublicPlayerFilters(row: PublicPlayerListRow, filters: {
  query: string;
  seasonName: string;
  postAuction: boolean;
  showEligibility: boolean;
  availableStatuses: readonly PublicPlayerStatus[];
  roles: readonly PublicPlayerListRow["role"][];
  statuses: readonly PublicPlayerStatus[];
  categories: readonly PublicPlayerCategory[];
}) {
  const category: PublicPlayerCategory = row.rookie ? "rookie" : row.under23 ? "under23" : "veteran";
  const status = publicPlayerStatus(row, filters.seasonName, filters.postAuction);
  const statusUnrestricted = filters.statuses.length === 0
    || filters.availableStatuses.every((value) => filters.statuses.includes(value));
  return row.name.toLowerCase().includes(filters.query.toLowerCase())
    && (filters.roles.length === 0 || filters.roles.includes(row.role))
    && (statusUnrestricted || filters.statuses.includes(status))
    && (!filters.showEligibility || filters.categories.length === 0 || filters.categories.includes(category));
}
