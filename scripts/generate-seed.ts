import { writeFile } from "node:fs/promises";
import snapshot from "../data/league-snapshot.json" with { type: "json" };

const outputPath = process.argv[2] ?? "supabase/seed.sql";
const sql = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === "") return "null";
  if (typeof value === "number") return String(value);
  return `'${value.replaceAll("'", "''")}'`;
};
const normalized = (name: string) => name
  .normalize("NFKD")
  .replace(/\p{Diacritic}/gu, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const playerMap = new Map<string, { name: string; role: string | null }>();
for (const entry of snapshot.rosterEntries) {
  const key = normalized(entry.name);
  const existing = playerMap.get(key);
  const validRole = entry.state === "active" && entry.slot !== "dpe" && ["G", "A", "C"].includes(entry.role ?? "")
    ? entry.role ?? null
    : null;
  playerMap.set(key, { name: entry.name, role: validRole ?? existing?.role ?? null });
}
for (const right of snapshot.qualifyingOfferRights) {
  const key = normalized(right.playerName);
  if (!playerMap.has(key)) playerMap.set(key, { name: right.playerName, role: null });
}

const lines: string[] = [
  "begin;",
  "",
  `insert into public.seasons(name, status, is_active) values (${sql(snapshot.season.name)}, 'offseason', true)`,
  "on conflict (name) do update set status = excluded.status, is_active = true;",
  "",
];

for (const team of snapshot.teams) {
  lines.push(
    `insert into public.teams(code, name, slug, owner_name) values (${sql(team.code)}, ${sql(team.name)}, ${sql(team.code.toLowerCase())}, ${sql(team.owner)})`,
    "on conflict (code) do update set name = excluded.name, slug = excluded.slug, owner_name = excluded.owner_name, active = true;",
  );
}
lines.push("");
for (const team of snapshot.teams) {
  lines.push(
    "insert into public.team_seasons(team_id, season_id, initial_credits, current_credits)",
    `select t.id, s.id, 1000, ${sql(team.currentCredits)} from public.teams t cross join public.seasons s where t.code = ${sql(team.code)} and s.name = ${sql(snapshot.season.name)}`,
    "on conflict (team_id, season_id) do update set current_credits = excluded.current_credits, updated_at = now();",
  );
}

lines.push("");
for (const [key, player] of playerMap) {
  lines.push(
    `insert into public.players(full_name, normalized_name, role, on_dunkest_list) values (${sql(player.name)}, ${sql(key)}, ${player.role ? `${sql(player.role)}::public.player_role` : "null"}, false)`,
    "on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();",
  );
}

lines.push(
  "",
  `delete from public.qualifying_offer_rights where season_id = (select id from public.seasons where name = ${sql(snapshot.season.name)});`,
  `delete from public.imported_draft_assets where season_id = (select id from public.seasons where name = ${sql(snapshot.season.name)});`,
  `delete from public.roster_entries where season_id = (select id from public.seasons where name = ${sql(snapshot.season.name)}) and acquisition_type = 'initial_import';`,
  "",
);

for (const entry of snapshot.rosterEntries) {
  const contract = String(entry.contract);
  const option = contract === "T.O." ? "'team'" : contract.includes("(Q)") ? "'qualifying'" : "null";
  const extensionCount = contract.includes("(E)") ? 1 : 0;
  lines.push(
    "insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)",
    `select s.id, t.id, p.id, ${sql(entry.slot)}::public.slot_type, ${sql(entry.state)}::public.roster_status, 'initial_import', ${sql(entry.cost)}, ${sql(entry.cost)}, ${option}, ${extensionCount}`,
    `from public.seasons s join public.teams t on t.code = ${sql(entry.teamCode)} join public.players p on p.normalized_name = ${sql(normalized(entry.name))}`,
    `where s.name = ${sql(snapshot.season.name)};`,
  );
}

lines.push("");
for (const right of snapshot.qualifyingOfferRights) {
  lines.push(
    "insert into public.qualifying_offer_rights(season_id, team_id, player_id, qualifying_amount, status)",
    `select s.id, t.id, p.id, ${sql(right.qualifyingAmount)}, 'eligible'`,
    `from public.seasons s join public.teams t on t.code = ${sql(right.teamCode)} join public.players p on p.normalized_name = ${sql(normalized(right.playerName))}`,
    `where s.name = ${sql(snapshot.season.name)};`,
  );
}

lines.push("");
for (const asset of snapshot.draftAssets) {
  lines.push(
    "insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)",
    `select s.id, t.id, ${sql(asset.label)}, ${sql(asset.round)}, ${sql(asset.year)}, ${sql(String(asset.originOrOverall))}`,
    `from public.seasons s join public.teams t on t.code = ${sql(asset.teamCode)} where s.name = ${sql(snapshot.season.name)};`,
  );
}

lines.push(
  "",
  "commit;",
  "",
  "select",
  "  (select count(*) from public.teams) as teams,",
  "  (select count(*) from public.players) as players,",
  "  (select count(*) from public.roster_entries where status = 'active') as active_roster_entries,",
  "  (select count(*) from public.roster_entries where status = 'cut') as cut_entries,",
  "  (select count(*) from public.qualifying_offer_rights) as qualifying_offer_rights,",
  "  (select count(*) from public.imported_draft_assets) as draft_assets;",
);

await writeFile(outputPath, `${lines.join("\n")}\n`, "utf8");
console.log(`Creato ${outputPath}: ${playerMap.size} giocatori, ${snapshot.rosterEntries.length} roster entries.`);
