import { createHash } from "node:crypto";
import {
  competitionNames,
  normalizeCompetitionContent,
  type CompetitionContentMap,
} from "./competitions";
import {
  historyCompetitionNames,
  normalizeHistoryEntries,
  type HistoryCompetitionMap,
} from "./history-competitions";
import {
  isLeagueMoment,
  macroPhaseForMoment,
  teamOptionsAreResolved,
  tradeDeadlineHasPassed,
  type LeagueMoment,
} from "./league-moments";
import { normalizeState, type EditableLeagueState } from "./league-state";
import type { createSupabaseServerClient } from "./supabase/server";

type Supabase = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

export const importableBackupFormat = "greyson-allen-league-importable-backup";
export const importableBackupFormatVersion = 1;
export const importableBackupSchemaVersion = "202608090022";

export type ImportableSeason = {
  name: string;
  status: "offseason" | "regular_season";
  team_options_resolved: boolean;
  trade_deadline_passed: boolean;
  timeline_moment: LeagueMoment;
};

export type ImportableCalendarRow = { event: string; date: string };

export type ImportableMovement = {
  id: string;
  operation_type: string;
  summary: string;
  before_state: Record<string, unknown>;
  after_state: Record<string, unknown>;
  history_category: string | null;
  before_history: unknown[] | null;
  after_history: unknown[] | null;
  reverts_movement_id?: string | null;
  created_at: string;
  reverted_at: string | null;
};

export type ImportableLeaguePayload = {
  activeSeason: ImportableSeason;
  leagueState: EditableLeagueState;
  calendar: ImportableCalendarRow[];
  competitions: CompetitionContentMap;
  history: HistoryCompetitionMap;
  movements: ImportableMovement[];
};

export type ImportableLeagueBackup = {
  format: typeof importableBackupFormat;
  formatVersion: typeof importableBackupFormatVersion;
  schemaVersion: string;
  exportedAt: string;
  checksum: string;
  payload: ImportableLeaguePayload;
};

export async function buildImportableLeagueBackup(supabase: Supabase): Promise<ImportableLeagueBackup> {
  const [leagueStateModule, competitionModule, historyModule] = await Promise.all([
    import("./league-state"),
    import("./competition-store"),
    import("./history-competition-store"),
  ]);
  const [seasonResponse, leagueState, competitionState, historyState, calendarResponse, movements] = await Promise.all([
    supabase
      .from("seasons")
      .select("name,status,team_options_resolved,trade_deadline_passed,timeline_moment")
      .eq("is_active", true)
      .maybeSingle(),
    leagueStateModule.loadEditableLeagueState(),
    competitionModule.loadCompetitionState(),
    historyModule.loadHistoryCompetitionState(),
    supabase
      .from("calendar_events")
      .select("event_text,date_text,sort_order,season_id,seasons!inner(is_active)")
      .eq("seasons.is_active", true)
      .order("sort_order"),
    fetchAllMovements(supabase),
  ]);

  if (seasonResponse.error || !seasonResponse.data) {
    throw new Error(seasonResponse.error?.message ?? "Nessuna stagione attiva.");
  }
  if (calendarResponse.error) throw new Error(`Calendario non disponibile: ${calendarResponse.error.message}`);
  if (!isLeagueMoment(seasonResponse.data.timeline_moment)) throw new Error("Momento della lega non valido.");

  const payload: ImportableLeaguePayload = {
    activeSeason: {
      name: seasonResponse.data.name,
      status: macroPhaseForMoment(seasonResponse.data.timeline_moment),
      team_options_resolved: seasonResponse.data.team_options_resolved,
      trade_deadline_passed: seasonResponse.data.trade_deadline_passed,
      timeline_moment: seasonResponse.data.timeline_moment,
    },
    leagueState,
    calendar: (calendarResponse.data ?? []).map((row) => ({
      event: row.event_text,
      date: row.date_text,
    })),
    competitions: competitionState.competitions,
    history: historyState.competitions,
    movements,
  };

  return createImportableBackupDocument(payload);
}

export function createImportableBackupDocument(
  payload: ImportableLeaguePayload,
  exportedAt = new Date().toISOString(),
): ImportableLeagueBackup {
  return {
    format: importableBackupFormat,
    formatVersion: importableBackupFormatVersion,
    schemaVersion: importableBackupSchemaVersion,
    exportedAt,
    checksum: checksumForPayload(payload),
    payload,
  };
}

export function parseImportableLeagueBackup(input: unknown): ImportableLeagueBackup {
  const document = asRecord(input);
  if (!document || document.format !== importableBackupFormat) {
    throw new Error("Il file non è un backup importabile della Greyson Allen League.");
  }
  if (document.formatVersion !== importableBackupFormatVersion) {
    throw new Error("Versione del backup non supportata.");
  }
  if (typeof document.exportedAt !== "string" || !Number.isFinite(Date.parse(document.exportedAt))) {
    throw new Error("Data di esportazione del backup non valida.");
  }
  const rawPayload = asRecord(document.payload);
  const rawSeason = asRecord(rawPayload?.activeSeason);
  const legacyAuctionStart = rawSeason?.timeline_moment === "free_releases_start";
  const timelineMoment = legacyAuctionStart ? "auction_start" : rawSeason?.timeline_moment;
  if (
    !rawPayload
    || !rawSeason
    || typeof rawSeason.name !== "string"
    || !/^\d{4}\/\d{2}$/.test(rawSeason.name)
    || !isLeagueMoment(timelineMoment)
    || rawSeason.status !== macroPhaseForMoment(timelineMoment)
    || typeof rawSeason.team_options_resolved !== "boolean"
    || typeof rawSeason.trade_deadline_passed !== "boolean"
    || rawSeason.team_options_resolved !== teamOptionsAreResolved(timelineMoment)
    || rawSeason.trade_deadline_passed !== tradeDeadlineHasPassed(timelineMoment)
  ) {
    throw new Error("Fase o annata del backup non valide.");
  }

  const rawState = asRecord(rawPayload.leagueState);
  if (!rawState || !requiredStateArrays.every((key) => Array.isArray(rawState[key]))) {
    throw new Error("Stato della lega mancante o incompleto.");
  }
  const leagueState = normalizeState(rawState);
  if (!leagueState.teams.every(validTeam) || !leagueState.rosterEntries.every(validRosterEntry)) {
    throw new Error("Squadre o roster del backup non validi.");
  }

  const rawCompetitions = asRecord(rawPayload.competitions);
  if (!rawCompetitions) throw new Error("Classifiche e tabelloni mancanti.");
  const teamCodes = leagueState.teams.map((team) => team.code);
  const competitions = Object.fromEntries(competitionNames.map((name) => {
    const content = normalizeCompetitionContent(name, rawCompetitions[name], teamCodes);
    if (!content) throw new Error(`Contenuto non valido per ${name}.`);
    return [name, content];
  })) as CompetitionContentMap;

  const rawHistory = asRecord(rawPayload.history);
  if (!rawHistory) throw new Error("Storico mancante.");
  const history = Object.fromEntries(historyCompetitionNames.map((name) => {
    const entries = normalizeHistoryEntries(name, rawHistory[name]);
    if (!entries) throw new Error(`Storico non valido per ${name}.`);
    return [name, entries];
  })) as HistoryCompetitionMap;

  if (!Array.isArray(rawPayload.calendar) || rawPayload.calendar.length > 300) {
    throw new Error("Calendario non valido.");
  }
  const calendar = rawPayload.calendar.map((row) => {
    const value = asRecord(row);
    if (!value || typeof value.event !== "string" || typeof value.date !== "string") {
      throw new Error("Riga del calendario non valida.");
    }
    return { event: value.event.slice(0, 500), date: value.date.slice(0, 500) };
  });

  if (!Array.isArray(rawPayload.movements) || rawPayload.movements.length > 50_000) {
    throw new Error("Registro movimenti non valido.");
  }
  const movements = rawPayload.movements.map(parseMovement);

  const payload: ImportableLeaguePayload = {
    activeSeason: {
      name: rawSeason.name,
      status: macroPhaseForMoment(timelineMoment),
      team_options_resolved: rawSeason.team_options_resolved,
      trade_deadline_passed: rawSeason.trade_deadline_passed,
      timeline_moment: timelineMoment,
    },
    leagueState,
    calendar,
    competitions,
    history,
    movements,
  };
  const checksumPayload = legacyAuctionStart
    ? {
        ...payload,
        activeSeason: { ...payload.activeSeason, timeline_moment: "free_releases_start" },
      }
    : payload;
  if (typeof document.checksum !== "string" || document.checksum !== checksumForPayload(checksumPayload)) {
    throw new Error("Il controllo di integrità del backup non è riuscito: il file potrebbe essere incompleto o modificato.");
  }

  return {
    format: importableBackupFormat,
    formatVersion: importableBackupFormatVersion,
    schemaVersion: legacyAuctionStart
      ? importableBackupSchemaVersion
      : typeof document.schemaVersion === "string" ? document.schemaVersion : "",
    exportedAt: document.exportedAt,
    checksum: checksumForPayload(payload),
    payload,
  };
}

function parseMovement(input: unknown): ImportableMovement {
  const movement = asRecord(input);
  const beforeState = asRecord(movement?.before_state);
  const afterState = asRecord(movement?.after_state);
  const historyCategory = movement?.history_category ?? null;
  const beforeHistory = movement?.before_history ?? null;
  const afterHistory = movement?.after_history ?? null;
  const hasRevertsMovementId = Boolean(movement && Object.hasOwn(movement, "reverts_movement_id"));
  const revertsMovementId = movement?.reverts_movement_id ?? null;
  if (
    !movement
    || typeof movement.id !== "string"
    || !uuidPattern.test(movement.id)
    || typeof movement.operation_type !== "string"
    || !movement.operation_type.trim()
    || typeof movement.summary !== "string"
    || !movement.summary.trim()
    || !beforeState
    || !afterState
    || (historyCategory !== null && (typeof historyCategory !== "string" || !historyCategory.trim()))
    || (beforeHistory !== null && !Array.isArray(beforeHistory))
    || (afterHistory !== null && !Array.isArray(afterHistory))
    || (historyCategory === null && (beforeHistory !== null || afterHistory !== null))
    || (historyCategory !== null && (beforeHistory === null || afterHistory === null))
    || (revertsMovementId !== null && (typeof revertsMovementId !== "string" || !uuidPattern.test(revertsMovementId)))
    || typeof movement.created_at !== "string"
    || !Number.isFinite(Date.parse(movement.created_at))
    || (movement.reverted_at !== null && (
      typeof movement.reverted_at !== "string" || !Number.isFinite(Date.parse(movement.reverted_at))
    ))
  ) {
    throw new Error("Il registro movimenti contiene una riga non valida.");
  }
  return {
    id: movement.id,
    operation_type: movement.operation_type.slice(0, 120),
    summary: movement.summary.slice(0, 1_000),
    before_state: beforeState,
    after_state: afterState,
    history_category: historyCategory,
    before_history: beforeHistory,
    after_history: afterHistory,
    ...(hasRevertsMovementId ? { reverts_movement_id: revertsMovementId } : {}),
    created_at: movement.created_at,
    reverted_at: movement.reverted_at,
  };
}

async function fetchAllMovements(supabase: Supabase): Promise<ImportableMovement[]> {
  const pageSize = 500;
  const rows: ImportableMovement[] = [];
  for (let page = 0; page < 100; page += 1) {
    const from = page * pageSize;
    const response = await supabase
      .from("league_movements")
      .select("id,operation_type,summary,before_state,after_state,history_category,before_history,after_history,reverts_movement_id,created_at,reverted_at")
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (response.error) throw new Error(`Registro movimenti non disponibile: ${response.error.message}`);
    const pageRows = (response.data ?? []).map(parseMovement);
    rows.push(...pageRows);
    if (pageRows.length < pageSize) return rows;
  }
  throw new Error("Il registro movimenti supera il limite esportabile di 50.000 righe.");
}

function checksumForPayload(payload: unknown) {
  return createHash("sha256").update(stableJson(payload)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function validTeam(team: EditableLeagueState["teams"][number]) {
  return Boolean(team && typeof team.code === "string" && team.code && typeof team.name === "string");
}

function validRosterEntry(entry: EditableLeagueState["rosterEntries"][number]) {
  return Boolean(
    entry
    && typeof entry.name === "string"
    && typeof entry.teamCode === "string"
    && Number.isFinite(entry.cost)
    && typeof entry.contract === "string"
    && (entry.state === "active" || entry.state === "cut")
    && ["regular", "two_way", "g_league", "dpe"].includes(entry.slot),
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

const requiredStateArrays = ["teams", "rosterEntries", "draftAssets", "qualifyingOfferRights", "playerList"] as const;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
