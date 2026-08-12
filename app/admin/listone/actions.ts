"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import ExcelJS from "exceljs";
import type { PlayerListEntry } from "@/lib/league-types";
import { nbaTeamCodes } from "@/data/nba-teams";
import { normalizePlayerName } from "@/lib/admin-alerts";
import { loadEditableLeagueState, type EditableLeagueState } from "@/lib/league-state";
import { suggestPlayerName } from "@/lib/player-name-matching";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PlayerListSaveState = { message?: string; error?: string; savedRevision?: number };
export type PlayerListImportMismatch = {
  sourceName: string;
  references: string[];
  suggestedName: string | null;
};
export type PlayerListImportPreview = {
  previewKey: string;
  players: PlayerListEntry[];
  mismatches: PlayerListImportMismatch[];
};
export type PlayerListImportState = { error?: string; preview?: PlayerListImportPreview };
type ImportResolution = {
  sourceName: string;
  kind: "existing" | "new";
  targetName: string;
  realTeam: string;
};

export async function savePlayerList(
  _previousState: PlayerListSaveState,
  formData: FormData,
): Promise<PlayerListSaveState> {
  try {
    const players = parsePlayers(formData.get("players_json"));
    const newPlayerNames = parseNewPlayerNames(formData.get("new_player_names_json"));
    const status = formData.get("list_status") === "published" ? "published" : "offseason";
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { error: "Supabase non configurato." };
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Sessione scaduta." };

    const current = await loadEditableLeagueState();
    if (current.playerListStatus === "offseason") {
      const invalidProvisionalEdit = status !== "offseason"
        || players.length !== current.playerList.length
        || players.some((player, index) => {
          const previous = current.playerList[index];
          return !previous
            || player.name !== previous.name
            || player.role !== previous.role
            || player.realTeam !== previous.realTeam
            || player.rookie !== previous.rookie
            || player.under23 !== previous.under23;
        });
      if (invalidProvisionalEdit) {
        return { error: "Il listone provvisorio non è modificabile. Per pubblicare il nuovo listone usa l’importazione Excel." };
      }
    }
    const playersByName = new Map(players.map((player) => [normalizePlayerName(player.name), player]));
    for (const name of newPlayerNames) {
      const player = playersByName.get(normalizePlayerName(name));
      if (!player) return { error: "La riga del nuovo giocatore non è valida." };
      const realTeam = player.realTeam.trim().toUpperCase();
      if (!realTeam || (realTeam !== "FA" && !nbaTeamCodes.has(realTeam))) {
        return { error: `Indica una squadra NBA valida per ${player.name}.` };
      }
    }
    const rolesByName = new Map(players.map((player) => [normalizePlayerName(player.name), player.role]));
    const nextState: EditableLeagueState = {
      ...current,
      rosterEntries: current.rosterEntries.map((entry) => {
        const role = rolesByName.get(normalizePlayerName(entry.name));
        return { ...entry, role: !role || role === "X" ? undefined : role };
      }),
      playerList: players,
      playerListStatus: status,
    };
    const response = await supabase.rpc("replace_league_state", { state_payload: nextState });
    if (response.error) return { error: response.error.message };

    [
      "/giocatori",
      "/admin",
      "/admin/listone",
      "/admin/asta",
      "/admin/free-agent",
      "/admin/draft",
    ].forEach((path) => revalidatePath(path));
    return {
      savedRevision: Date.now(),
      message: status === "published"
        ? `Listone ufficiale salvato: ${players.length} giocatori.`
        : `Listone offseason salvato: ${players.length} giocatori.`,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Listone non valido." };
  }
}

export async function preparePlayerListImport(
  _previousState: PlayerListImportState,
  formData: FormData,
): Promise<PlayerListImportState> {
  const file = formData.get("list_file");
  if (!(file instanceof File) || !file.size) return { error: "Seleziona un file Excel." };
  if (file.size > 8_000_000) return { error: "Il file supera il limite di 8 MB." };

  try {
    const players = await playersFromWorkbook(file);
    if (!players.length) throw new Error("Il foglio Listone non contiene giocatori.");
    const supabase = await createSupabaseServerClient();
    if (!supabase) throw new Error("Supabase non configurato.");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Sessione scaduta.");
    const current = await loadEditableLeagueState();
    const references = referencedPlayerNames(current);
    const importedNames = new Set(players.map((player) => player.name));
    const mismatches = [...references.entries()]
      .filter(([sourceName]) => !importedNames.has(sourceName))
      .map(([sourceName, sourceReferences]) => ({
        sourceName,
        references: [...sourceReferences].sort((left, right) => left.localeCompare(right, "it")),
        suggestedName: suggestPlayerName(sourceName, players),
      }))
      .sort((left, right) => left.sourceName.localeCompare(right.sourceName, "it"));
    return {
      preview: {
        previewKey: `${Date.now()}-${file.name}`,
        players,
        mismatches,
      },
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "File non valido." };
  }
}

export async function confirmPlayerListImport(formData: FormData) {
  try {
    const importedPlayers = validatePlayers(JSON.parse(String(formData.get("imported_players_json") ?? "[]")) as unknown);
    const resolutions = parseResolutions(formData.get("resolutions_json"));
    const supabase = await createSupabaseServerClient();
    if (!supabase) throw new Error("Supabase non configurato.");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Sessione scaduta.");
    const current = await loadEditableLeagueState();
    const references = referencedPlayerNames(current);
    const importedExact = new Map(importedPlayers.map((player) => [player.name, player]));
    const requiredSources = [...references.keys()].filter((sourceName) => !importedExact.has(sourceName));
    const resolutionBySource = new Map(resolutions.map((resolution) => [resolution.sourceName, resolution]));
    for (const sourceName of requiredSources) {
      if (!resolutionBySource.has(sourceName)) throw new Error(`Scegli come gestire ${sourceName}.`);
    }
    if (resolutions.some((resolution) => !requiredSources.includes(resolution.sourceName))) {
      throw new Error("La situazione dei roster è cambiata: ripeti l’importazione.");
    }

    const players = [...importedPlayers];
    const playerByNormalizedName = new Map(players.map((player) => [normalizePlayerName(player.name), player]));
    const canonicalBySource = new Map<string, PlayerListEntry>();
    for (const resolution of resolutions) {
      let target: PlayerListEntry | undefined;
      if (resolution.kind === "existing") {
        target = importedExact.get(resolution.targetName);
        if (!target) throw new Error(`Il giocatore selezionato per ${resolution.sourceName} non è più presente nel listone importato.`);
      } else {
        const name = cleanPlayerName(resolution.targetName);
        const realTeam = resolution.realTeam.toUpperCase();
        if (!name) throw new Error(`Inserisci il nome da aggiungere per ${resolution.sourceName}.`);
        if (!realTeam || (realTeam !== "FA" && !nbaTeamCodes.has(realTeam))) throw new Error(`Indica la squadra reale di ${name}.`);
        target = playerByNormalizedName.get(normalizePlayerName(name));
        if (!target) {
          target = { name, role: "X", realTeam, rookie: false, under23: false };
          players.push(target);
          playerByNormalizedName.set(normalizePlayerName(name), target);
          importedExact.set(name, target);
        }
      }
      canonicalBySource.set(resolution.sourceName, target);
    }

    const canonicalPlayer = (sourceName: string) => importedExact.get(sourceName) ?? canonicalBySource.get(sourceName);
    const rosterEntries = current.rosterEntries.map((entry) => {
      const target = canonicalPlayer(entry.name);
      if (!target) throw new Error(`Nessuna corrispondenza confermata per ${entry.name}.`);
      return {
        ...entry,
        name: target.name,
        role: target.role === "X" ? undefined : target.role,
      };
    });
    ensureNoActiveRosterDuplicates(rosterEntries);
    const qualifyingOfferRights = current.qualifyingOfferRights.map((right) => {
      const target = canonicalPlayer(right.playerName);
      if (!target) throw new Error(`Nessuna corrispondenza confermata per la Q.O. di ${right.playerName}.`);
      return { ...right, playerName: target.name };
    });
    ensureNoQualifyingOfferConflicts(qualifyingOfferRights);

    const nextState: EditableLeagueState = {
      ...current,
      rosterEntries,
      qualifyingOfferRights,
      playerList: players,
      playerListStatus: "published",
    };
    const response = await supabase.rpc("replace_league_state", { state_payload: nextState });
    if (response.error) throw new Error(response.error.message);
    revalidatePlayerListPaths();
    redirect(`/admin/listone?imported=${players.length}&aligned=${requiredSources.length}`);
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    const message = error instanceof Error ? error.message : "Conferma non valida.";
    redirect(`/admin/listone?error=${encodeURIComponent(message)}`);
  }
}

function parseNewPlayerNames(value: FormDataEntryValue | null) {
  const parsed = JSON.parse(String(value ?? "[]")) as unknown;
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error("Nuove righe del listone non valide.");
  }
  return parsed.map((item) => item.trim()).filter(Boolean);
}

function parsePlayers(value: FormDataEntryValue | null): PlayerListEntry[] {
  const parsed = JSON.parse(String(value ?? "[]")) as unknown;
  return validatePlayers(parsed);
}

function validatePlayers(parsed: unknown): PlayerListEntry[] {
  if (!Array.isArray(parsed)) throw new Error("Il contenuto del listone non è valido.");
  if (parsed.length > 5000) throw new Error("Il listone contiene troppe righe.");

  const names = new Set<string>();
  return parsed.map((row, index) => {
    if (!row || typeof row !== "object") throw new Error(`Riga ${index + 1} non valida.`);
    const item = row as Partial<PlayerListEntry>;
    const name = String(item.name ?? "").trim().replace(/\s+/g, " ");
    const realTeam = String(item.realTeam ?? "").trim().slice(0, 80);
    if (!name || name.length > 120) throw new Error(`Inserisci un nome valido alla riga ${index + 1}.`);
    if (item.role !== "G" && item.role !== "A" && item.role !== "C" && item.role !== "X") {
      throw new Error(`Seleziona il ruolo alla riga ${index + 1}.`);
    }
    const normalized = normalizePlayerName(name);
    if (names.has(normalized)) throw new Error(`Il giocatore ${name} compare più di una volta.`);
    names.add(normalized);
    return {
      name,
      role: item.role,
      realTeam,
      rookie: item.rookie === true,
      under23: item.under23 === true,
    };
  });
}

async function playersFromWorkbook(file: File) {
  const workbook = new ExcelJS.Workbook();
  const fileBuffer = await file.arrayBuffer();
  await workbook.xlsx.load(fileBuffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.getWorksheet("Listone") ?? workbook.worksheets[0];
  if (!sheet) throw new Error("Il file non contiene fogli leggibili.");
  const imported: unknown[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const name = cellText(row.getCell(2).value);
    if (!name) return;
    imported.push({
      name,
      role: cellText(row.getCell(3).value).toUpperCase(),
      realTeam: cellText(row.getCell(4).value),
      rookie: isYes(row.getCell(5).value),
      under23: isYes(row.getCell(6).value),
    });
  });
  return validatePlayers(imported);
}

function referencedPlayerNames(state: EditableLeagueState) {
  const references = new Map<string, Set<string>>();
  const add = (name: string, reference: string) => {
    const current = references.get(name) ?? new Set<string>();
    current.add(reference);
    references.set(name, current);
  };
  state.rosterEntries.forEach((entry) => {
    const placement = entry.state === "cut"
      ? "tagliato"
      : entry.slot === "two_way" ? "Two-way" : entry.slot === "g_league" ? "G-League" : entry.slot === "dpe" ? "DPE" : "roster";
    add(entry.name, `${entry.teamCode} · ${placement}`);
  });
  state.qualifyingOfferRights.forEach((right) => add(right.playerName, `${right.teamCode} · Q.O.`));
  return references;
}

function parseResolutions(value: FormDataEntryValue | null): ImportResolution[] {
  const parsed = JSON.parse(String(value ?? "[]")) as unknown;
  if (!Array.isArray(parsed)) throw new Error("Abbinamenti non validi.");
  const sources = new Set<string>();
  return parsed.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Abbinamento non valido.");
    const row = item as Partial<ImportResolution>;
    const sourceName = String(row.sourceName ?? "").trim();
    const targetName = String(row.targetName ?? "").trim();
    const kind = row.kind === "new" ? "new" : row.kind === "existing" ? "existing" : null;
    if (!sourceName || !targetName || !kind || sources.has(sourceName)) throw new Error("Abbinamento non valido.");
    sources.add(sourceName);
    return { sourceName, targetName, kind, realTeam: String(row.realTeam ?? "").trim() };
  });
}

function cleanPlayerName(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 120);
}

function ensureNoActiveRosterDuplicates(entries: EditableLeagueState["rosterEntries"]) {
  const owners = new Map<string, string[]>();
  entries.filter((entry) => entry.state === "active").forEach((entry) => {
    const key = normalizePlayerName(entry.name);
    owners.set(key, [...(owners.get(key) ?? []), entry.teamCode]);
  });
  const duplicate = [...owners.entries()].find(([, teams]) => teams.length > 1);
  if (duplicate) {
    const name = entries.find((entry) => normalizePlayerName(entry.name) === duplicate[0])?.name ?? duplicate[0];
    throw new Error(`${name} risulterebbe attivo più di una volta (${duplicate[1].join(", ")}).`);
  }
}

function ensureNoQualifyingOfferConflicts(rights: EditableLeagueState["qualifyingOfferRights"]) {
  const teamsByPlayer = new Map<string, Set<string>>();
  rights.forEach((right) => {
    const key = normalizePlayerName(right.playerName);
    const teams = teamsByPlayer.get(key) ?? new Set<string>();
    teams.add(right.teamCode);
    teamsByPlayer.set(key, teams);
  });
  const conflict = [...teamsByPlayer.entries()].find(([, teams]) => teams.size > 1);
  if (conflict) throw new Error(`La stessa Q.O. risulterebbe assegnata a più squadre: ${[...conflict[1]].join(", ")}.`);
}

function cellText(value: ExcelJS.CellValue) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("text" in value) return String(value.text ?? "").trim();
    if ("result" in value) return String(value.result ?? "").trim();
    if ("richText" in value) return value.richText.map((part) => part.text).join("").trim();
  }
  return String(value).trim();
}

function isYes(value: ExcelJS.CellValue) {
  return ["si", "sì", "yes", "true", "1", "x"].includes(cellText(value).toLocaleLowerCase("it-IT"));
}

function revalidatePlayerListPaths() {
  ["/giocatori", "/admin", "/admin/listone", "/admin/asta", "/admin/free-agent", "/admin/draft"]
    .forEach((path) => revalidatePath(path));
}

function isNextRedirect(error: unknown) {
  return Boolean(error && typeof error === "object" && "digest" in error && String((error as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT"));
}
