import ExcelJS from "exceljs";
import type { EditableLeagueState } from "./league-state";
import type { PlayerListEntry, RosterEntry } from "./league-types";
import { buildPublicPlayerListRows } from "./public-player-list";
import { calculateCapSpace } from "./season-time";

type Input = {
  state: EditableLeagueState;
  seasonName: string;
  exportedAt: Date;
  countTeamOptions: boolean;
};

const ink = "FF173F36";
const pale = "FFEAF3EE";
const muted = "FF5A7065";

export function buildAuctionEmergencyWorkbook({ state, seasonName, exportedAt, countTeamOptions }: Input) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Greyson Allen League";
  workbook.created = exportedAt;

  const teamsSheet = workbook.addWorksheet("Squadre", { views: [{ state: "frozen", ySplit: 2, showGridLines: false }] });
  teamsSheet.columns = [{ width: 36 }, { width: 21 }, { width: 28 }];
  addTitle(teamsSheet, "Asta · squadre", seasonName, exportedAt, 3);

  const listRoleByName = new Map(state.playerList.map((player) => [nameKey(player.name), player.role]));
  let rowNumber = 4;
  for (const team of state.teams) {
    const teamEntries = state.rosterEntries.filter((entry) => entry.teamCode === team.code);
    const capSpace = calculateCapSpace({
      entries: teamEntries,
      seasonName,
      optionSeasonName: seasonName,
      countTeamOptions,
    });
    const active = teamEntries.filter((entry) => entry.state === "active");
    const roles = active.reduce((counts, entry) => {
      if (entry.slot === "dpe") return counts;
      const role = listRoleByName.get(nameKey(entry.name)) ?? entry.role ?? "X";
      if (role === "G" || role === "A" || role === "C") counts[role] += 1;
      return counts;
    }, { G: 0, A: 0, C: 0 });
    const teamRow = teamsSheet.getRow(rowNumber++);
    teamRow.values = [team.name, `Cap libero: ${capSpace}`, `Ruoli: ${roles.G} G - ${roles.A} A - ${roles.C} C`];
    teamRow.height = 24;
    teamRow.font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    teamRow.fill = solid(ink);
    teamRow.getCell(3).alignment = { horizontal: "right", vertical: "middle" };
    for (const [slot, label] of [
      ["regular", "Roster"],
      ["two_way", "Two-way"],
      ["g_league", "G-League"],
    ] as const) {
      rowNumber = addSection(teamsSheet, rowNumber, label);
      rowNumber = addRosterEntries(
        teamsSheet,
        rowNumber,
        active.filter((entry) => entry.slot === slot),
        listRoleByName,
        slot === "regular" ? 15 : slot === "two_way" ? 2 : 3,
      );
    }

    rowNumber = addSection(teamsSheet, rowNumber, "Tagliati");
    const cutEntries = teamEntries.filter((entry) => entry.state === "cut");
    rowNumber = addRosterEntries(teamsSheet, rowNumber, cutEntries, undefined, cutEntries.length + 5);

    rowNumber = addSection(teamsSheet, rowNumber, "Q.O.");
    for (const right of state.qualifyingOfferRights.filter((item) => item.teamCode === team.code)) {
      const role = state.playerListStatus === "published"
        ? listRoleByName.get(nameKey(right.playerName)) ?? right.role ?? "X"
        : right.role ?? listRoleByName.get(nameKey(right.playerName)) ?? "X";
      addDetailRow(teamsSheet, rowNumber++, right.playerName, role, right.qualifyingAmount);
    }
    rowNumber += 2;
  }

  const listSheet = workbook.addWorksheet("Listone", { views: [{ state: "frozen", ySplit: 4, showGridLines: false }] });
  listSheet.columns = [{ width: 39 }, { width: 12 }, { width: 32 }];
  addTitle(listSheet, "Asta · listone", seasonName, exportedAt, 3);
  const heading = listSheet.getRow(4);
  heading.values = ["Giocatore", "Ruolo", "Stato"];
  heading.height = 22;
  heading.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
  heading.fill = solid(ink);
  heading.alignment = { vertical: "middle" };

  const teamNames = new Map(state.teams.map((team) => [team.code, team.name]));
  buildPublicPlayerListRows(state).forEach((player, index) => {
    const status = player.rosterTeamCode
      ? ""
      : player.qualifyingTeamCode
        ? `Q.O. · ${teamNames.get(player.qualifyingTeamCode) ?? player.qualifyingTeamCode}`
        : "FA";
    const row = listSheet.getRow(index + 5);
    row.values = [player.name, player.role, status];
    row.font = { name: "Arial", size: 10 };
    row.alignment = { vertical: "middle" };
    if (index % 2 === 1) row.fill = solid("FFF5F8F6");
  });
  if (state.playerList.length) listSheet.autoFilter = { from: "A4", to: `C${state.playerList.length + 4}` };
  return workbook;
}

function addTitle(sheet: ExcelJS.Worksheet, title: string, seasonName: string, exportedAt: Date, columnCount: number) {
  sheet.getCell("A1").value = title;
  sheet.getCell("A1").font = { name: "Arial", size: 15, bold: true, color: { argb: ink } };
  sheet.getCell("A2").value = `${seasonName} · Fotografia del ${new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(exportedAt)}`;
  sheet.getCell("A2").font = { name: "Arial", size: 10, italic: true, color: { argb: muted } };
  sheet.getRow(1).height = 27;
  sheet.getRow(2).height = 19;
  sheet.getRow(3).height = 9;
  sheet.pageSetup = { fitToPage: true, fitToWidth: 1, fitToHeight: 0, orientation: "portrait" };
  sheet.properties.defaultRowHeight = 18;
  for (let index = 1; index <= columnCount; index += 1) sheet.getColumn(index).alignment = { vertical: "middle" };
}

function addSection(sheet: ExcelJS.Worksheet, rowNumber: number, label: string) {
  const row = sheet.getRow(rowNumber);
  row.getCell(1).value = label;
  row.font = { name: "Arial", size: 10, bold: true, color: { argb: ink } };
  row.fill = solid(pale);
  row.height = 20;
  return rowNumber + 1;
}

function addRosterEntries(sheet: ExcelJS.Worksheet, start: number, entries: RosterEntry[], roles?: Map<string, PlayerListEntry["role"]>, minimumRows = 0) {
  let rowNumber = start;
  for (const entry of entries) {
    addDetailRow(sheet, rowNumber++, entry.name, roles?.get(nameKey(entry.name)) ?? entry.role ?? "X", entry.cost);
  }
  for (let index = entries.length; index < minimumRows; index += 1) {
    const row = sheet.getRow(rowNumber++);
    row.height = 18;
    for (let column = 1; column <= 3; column += 1) {
      row.getCell(column).border = { bottom: { style: "hair", color: { argb: "FFDCE8E1" } } };
    }
  }
  return rowNumber;
}

function addDetailRow(sheet: ExcelJS.Worksheet, rowNumber: number, name: string, role: string, cost: number) {
  const row = sheet.getRow(rowNumber);
  row.values = [name, role, cost];
  row.font = { name: "Arial", size: 10 };
  row.getCell(3).numFmt = "0";
  row.getCell(3).alignment = { horizontal: "right", vertical: "middle" };
}

function nameKey(name: string) {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("it-IT");
}

function solid(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}
