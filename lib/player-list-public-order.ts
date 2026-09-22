export function numberPublicAvailablePlayers<T extends { rosterTeamCode: string | null }>(rows: readonly T[]) {
  let nextOrder = 0;
  return rows.map((row) => ({
    ...row,
    publicOrder: row.rosterTeamCode ? null : ++nextOrder,
  }));
}
