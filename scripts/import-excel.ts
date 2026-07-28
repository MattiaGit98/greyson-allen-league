import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";

type Issue = { severity: "error" | "warning"; code: string; message: string; cell?: string };
type PlayerRow = { name: string; cost: number; contract: string; role?: string; state: "active" | "cut"; teamCode: string; cell: string };
type QualifyingOfferRight = { playerName: string; qualifyingAmount: number; teamCode: string; cell: string };
type DraftAsset = { label: string; round: string; year: number; originOrOverall: string | number; teamCode: string; cell: string };

const filePath = process.argv[2];
if (!filePath) throw new Error("Uso: npm run import:excel -- <percorso-file.xlsx>");
const phaseArg = process.argv.find((argument) => argument.startsWith("--phase="));
const phase = phaseArg?.split("=")[1] ?? "offseason";
const snapshotArg = process.argv.find((argument) => argument.startsWith("--snapshot="));
const snapshotPath = snapshotArg?.slice("--snapshot=".length);
if (!["offseason", "auction", "regular_season"].includes(phase)) {
  throw new Error("Fase non valida. Usare --phase=offseason, --phase=auction o --phase=regular_season.");
}

const bytes = await readFile(filePath);
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(filePath);
const roster = workbook.getWorksheet("Roster");
if (!roster) throw new Error("Foglio Roster non trovato.");

const issues: Issue[] = [];
const teams = [];
const players: PlayerRow[] = [];
const qualifyingOfferRights: QualifyingOfferRight[] = [];
const draftAssets: DraftAsset[] = [];
for (let block = 0; block < 14; block += 1) {
  const start = 2 + block * 4;
  const owner = String(roster.getCell(2, start).value ?? "").trim();
  const code = String(roster.getCell(2, start + 2).value ?? "").trim().toUpperCase();
  const name = String(roster.getCell(3, start).value ?? "").trim();
  if (!owner || !code || !name) issues.push({ severity: "error", code: "TEAM_FIELDS", message: `Dati squadra incompleti nel blocco ${block + 1}.` });
  const teamPlayers: PlayerRow[] = [];
  for (const [from, to, state] of [[8, 27, "active"], [29, 42, "cut"]] as const) {
    for (let row = from; row <= to; row += 1) {
      const value = roster.getCell(row, start).value;
      if (!value) continue;
      const cost = Number(roster.getCell(row, start + 1).value);
      const contract = String(roster.getCell(row, start + 2).value ?? "").trim();
      const role = String(roster.getCell(row, start + 3).value ?? "").trim() || undefined;
      const cell = roster.getCell(row, start).address;
      if (!Number.isInteger(cost) || cost < 1) issues.push({ severity: "error", code: "INVALID_COST", message: `${value}: costo non valido.`, cell });
      if (state === "active" && !["G", "A", "C"].includes(role ?? "")) issues.push({ severity: "error", code: "INVALID_ROLE", message: `${value}: ruolo mancante o non valido.`, cell });
      if (!contract) issues.push({ severity: "warning", code: "MISSING_CONTRACT", message: `${value}: contratto/scadenza mancante.`, cell });
      const player = { name: String(value).trim(), cost, contract, role, state, teamCode: code, cell };
      players.push(player);
      teamPlayers.push(player);
    }
  }
  const committedCost = teamPlayers.reduce((sum, player) => sum + (Number.isFinite(player.cost) ? player.cost : 0), 0);
  teams.push({ owner, code, name, initialCredits: 1000, currentCredits: 1000 - committedCost, committedCost });
  for (let row = 46; row <= 60; row += 1) {
    const value = roster.getCell(row, start).value;
    if (!value) continue;
    const year = Number(roster.getCell(row, start + 2).value);
    const round = String(roster.getCell(row, start + 1).value ?? "").trim();
    const originOrOverall = roster.getCell(row, start + 3).value;
    const cell = roster.getCell(row, start).address;
    if (!Number.isInteger(year) || !round) {
      issues.push({ severity: "error", code: "INVALID_DRAFT_ASSET", message: `${value}: anno o giro non valido.`, cell });
    }
    draftAssets.push({
      label: String(value).trim(),
      round,
      year,
      originOrOverall: typeof originOrOverall === "number" ? originOrOverall : String(originOrOverall ?? "").trim(),
      teamCode: code,
      cell,
    });
  }
  for (let row = 62; row <= 66; row += 1) {
    const value = roster.getCell(row, start).value;
    if (!value) continue;
    const qualifyingAmount = Number(roster.getCell(row, start + 1).value);
    const cell = roster.getCell(row, start).address;
    if (!Number.isInteger(qualifyingAmount) || qualifyingAmount < 1) {
      issues.push({ severity: "error", code: "INVALID_QUALIFYING_AMOUNT", message: `${value}: valore della qualifying offer non valido.`, cell });
    }
    qualifyingOfferRights.push({ playerName: String(value).trim(), qualifyingAmount, teamCode: code, cell });
  }
}

const normalized = (name: string) => name.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const ownership = new Map<string, PlayerRow[]>();
for (const player of players) {
  const key = normalized(player.name);
  ownership.set(key, [...(ownership.get(key) ?? []), player]);
}
for (const entries of ownership.values()) {
  const activeEntries = entries.filter((entry) => entry.state === "active");
  if (activeEntries.length > 1) issues.push({
    severity: "error",
    code: "DUPLICATE_ACTIVE_ROSTER",
    message: `${activeEntries[0].name} compare in più roster attivi: ${activeEntries.map((p) => p.teamCode).join(", ")}.`,
    cell: activeEntries.map((p) => p.cell).join(","),
  });
}

const list = workbook.getWorksheet("Listone");
const listRows = list ? Math.max(0, list.actualRowCount - 2) : 0;
if (!listRows && phase !== "offseason") {
  issues.push({ severity: "warning", code: "EMPTY_PLAYER_LIST", message: "Il foglio Listone è vuoto fuori dalla fase di offseason." });
}

const report = {
  schemaVersion: 1,
  mode: "dry-run",
  source: { file: path.basename(filePath), sha256: createHash("sha256").update(bytes).digest("hex") },
  summary: {
    teams: teams.length,
    activeRosterEntries: players.filter((p) => p.state === "active").length,
    cutRosterEntries: players.filter((p) => p.state === "cut").length,
    qualifyingOfferRights: qualifyingOfferRights.length,
    draftAssets: draftAssets.length,
    uniquePlayers: ownership.size,
    errors: issues.filter((i) => i.severity === "error").length,
    warnings: issues.filter((i) => i.severity === "warning").length,
  },
  issues,
  data: { teams, players, qualifyingOfferRights, draftAssets },
};
await writeFile("import-report.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
if (snapshotPath) {
  const snapshot = {
    generatedAt: new Date().toISOString(),
    sourceSha256: report.source.sha256,
    season: { name: "2025/26", phase },
    teams,
    rosterEntries: players.map(({ cell: _cell, ...player }) => player),
    qualifyingOfferRights: qualifyingOfferRights.map(({ cell: _cell, ...right }) => right),
    draftAssets: draftAssets.map(({ cell: _cell, ...asset }) => asset),
  };
  await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}
console.log(JSON.stringify(report.summary, null, 2));
if (report.summary.errors) process.exitCode = 1;
