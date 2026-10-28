import type { RosterEntry } from "./league-types";
import { seasonEndYear } from "./season-time";

export type RosterSortKey = "role" | "name" | "contract" | "cost";
export type RosterSortState = { key: RosterSortKey; direction: "asc" | "desc" };

export function sortPlayerEntries(entries: RosterEntry[], seasonName: string, sort: RosterSortState) {
  const direction = sort.direction === "asc" ? 1 : -1;
  return [...entries].sort((left, right) => {
    let result: number;
    if (sort.key === "cost") {
      result = left.cost - right.cost;
    } else if (sort.key === "contract") {
      result = contractSortValue(left.contract, seasonName) - contractSortValue(right.contract, seasonName);
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
      const costDifference = right.cost - left.cost;
      if (costDifference !== 0) return costDifference;
    }
    return left.name.localeCompare(right.name, "it");
  });
}

function contractSortValue(value: string, seasonName: string) {
  const contract = value.trim().toLocaleUpperCase("it-IT");
  const activeYear = seasonEndYear(seasonName);
  const shortYear = contract.match(/^\d{2}/)?.[0];
  let year: number;
  if (shortYear !== undefined) {
    year = Math.floor((activeYear ?? 2000) / 100) * 100 + Number(shortYear);
    if (activeYear !== null && year < activeYear - 50) year += 100;
    if (activeYear !== null && year > activeYear + 50) year -= 100;
  } else if (/^(?:T\.?O\.?|R\.?E\.?)$/.test(contract) && activeYear !== null) {
    year = activeYear - 1;
  } else {
    return Number.MAX_SAFE_INTEGER;
  }
  const priority = /\+\s*T\.?O\.?|^T\.?O\.?$/.test(contract) ? 5
    : /\+\s*R\.?E\.?|^R\.?E\.?$/.test(contract) ? 4
      : /\+\s*EXT|\(E\)/.test(contract) ? 3
        : /\+\s*Q\.?O\.?|\(Q\)/.test(contract) ? 2
          : 1;
  return year * 10 + priority;
}

function roleSortValue(role: RosterEntry["role"]) {
  return role === "G" ? 0 : role === "A" ? 1 : role === "C" ? 2 : 3;
}
