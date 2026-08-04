import type { RosterEntry } from "./league-types";
import { contractCostForSeason } from "./season-time";

export type RosterSortKey = "role" | "name" | "contract" | "cost";
export type RosterSortState = { key: RosterSortKey; direction: "asc" | "desc" };

export function sortPlayerEntries(entries: RosterEntry[], seasonName: string, sort: RosterSortState) {
  const direction = sort.direction === "asc" ? 1 : -1;
  return [...entries].sort((left, right) => {
    let result: number;
    if (sort.key === "cost") {
      result = contractCostForSeason(left, seasonName) - contractCostForSeason(right, seasonName);
    } else if (sort.key === "contract") {
      result = contractSortValue(left.contract) - contractSortValue(right.contract);
    } else if (sort.key === "role") {
      const leftRole = roleSortValue(left.role);
      const rightRole = roleSortValue(right.role);
      result = leftRole === 3 || rightRole === 3
        ? leftRole === rightRole ? 0 : leftRole === 3 ? direction : -direction
        : leftRole - rightRole;
    } else {
      result = left.name.localeCompare(right.name, "it");
    }
    if (result !== 0) return result * direction;
    if (sort.key === "role" || sort.key === "contract") {
      const costDifference = contractCostForSeason(right, seasonName) - contractCostForSeason(left, seasonName);
      if (costDifference !== 0) return costDifference;
    }
    return left.name.localeCompare(right.name, "it");
  });
}

function contractSortValue(value: string) {
  return Number(String(value).match(/\d+/)?.[0] ?? 999);
}

function roleSortValue(role: RosterEntry["role"]) {
  return role === "G" ? 0 : role === "A" ? 1 : role === "C" ? 2 : 3;
}
