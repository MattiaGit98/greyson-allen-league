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
import {
  datedLeagueTransitions,
  isPhaseDate,
  normalizePhaseDates,
  type PhaseDateMap,
} from "./phase-calendar";
import type { createSupabaseServerClient } from "./supabase/server";

type Supabase = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

export const importableBackupFormat = "greyson-allen-league-importable-backup";
export const importableBackupFormatVersion = 2;
export const importableBackupSchemaVersion = "20260927140919";
export type ImportableBackupFormatVersion = typeof importableBackupFormatVersion;

export type ImportableSeason = {
  name: string;
  status: "offseason" | "regular_season";
  team_options_resolved: boolean;
  trade_deadline_passed: boolean;
  timeline_moment: LeagueMoment;
  phase_dates: PhaseDateMap;
};

export type ImportableTeamRecord = {
  id: string;
  code: string;
  name: string;
  slug: string;
  owner_name: string;
  logo_url: string | null;
  active: boolean;
};

export type ImportableContractDraft = {
  season_name: string;
  team_code: string;
  player_name: string;
  contract_kind: "annual" | "biennial" | "triennial" | "team_option";
  slot: "regular" | "two_way" | "g_league";
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
  season_name: string | null;
  undo_before_moment: LeagueMoment | null;
  reverts_movement_id: string | null;
  created_at: string;
  reverted_at: string | null;
};

export type ImportableLeaguePayload = {
  activeSeason: ImportableSeason;
  teamRecords: ImportableTeamRecord[];
  leagueState: EditableLeagueState;
  calendar: ImportableCalendarRow[];
  competitions: CompetitionContentMap;
  history: HistoryCompetitionMap;
  contractDrafts: ImportableContractDraft[];
  movements: ImportableMovement[];
};

export type ImportableLeagueBackup = {
  format: typeof importableBackupFormat;
  formatVersion: ImportableBackupFormatVersion;
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
  const [
    seasonResponse,
    teamResponse,
    leagueState,
    competitionState,
    historyState,
    calendarResponse,
    contractDraftResponse,
    movements,
  ] = await Promise.all([
    supabase
      .from("seasons")
      .select("name,status,team_options_resolved,trade_deadline_passed,timeline_moment,phase_dates")
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("teams")
      .select("id,code,name,slug,owner_name,logo_url,active")
      .order("code"),
    leagueStateModule.loadEditableLeagueState(),
    competitionModule.loadCompetitionState(),
    historyModule.loadHistoryCompetitionState(),
    supabase
      .from("calendar_events")
      .select("event_text,date_text,sort_order,season_id,seasons!inner(is_active)")
      .eq("seasons.is_active", true)
      .order("sort_order"),
    supabase
      .from("post_auction_contract_drafts")
      .select("season_name,team_code,player_name,contract_kind,slot")
      .order("season_name")
      .order("team_code")
      .order("player_name"),
    fetchAllMovements(supabase),
  ]);

  if (seasonResponse.error || !seasonResponse.data) {
    throw new Error(seasonResponse.error?.message ?? "Nessuna stagione attiva.");
  }
  if (teamResponse.error) throw new Error(`Squadre non disponibili: ${teamResponse.error.message}`);
  if (calendarResponse.error) throw new Error(`Calendario non disponibile: ${calendarResponse.error.message}`);
  if (contractDraftResponse.error) {
    throw new Error(`Bozze dei contratti non disponibili: ${contractDraftResponse.error.message}`);
  }
  if (!isLeagueMoment(seasonResponse.data.timeline_moment)) throw new Error("Momento della lega non valido.");

  const payload: ImportableLeaguePayload = {
    activeSeason: {
      name: seasonResponse.data.name,
      status: macroPhaseForMoment(seasonResponse.data.timeline_moment),
      team_options_resolved: seasonResponse.data.team_options_resolved,
      trade_deadline_passed: seasonResponse.data.trade_deadline_passed,
      timeline_moment: seasonResponse.data.timeline_moment,
      phase_dates: normalizePhaseDates(seasonResponse.data.phase_dates),
    },
    teamRecords: (teamResponse.data ?? []).map(parseTeamRecord),
    leagueState,
    calendar: (calendarResponse.data ?? []).map((row) => ({
      event: row.event_text,
      date: row.date_text,
    })),
    competitions: competitionState.competitions,
    history: historyState.competitions,
    contractDrafts: (contractDraftResponse.data ?? []).map(parseContractDraft),
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
  if (!rawPayload) throw new Error("Contenuto del backup mancante.");
  if (typeof document.checksum !== "string" || document.checksum !== checksumForPayload(rawPayload)) {
    throw new Error("Il controllo di integrità del backup non è riuscito: il file potrebbe essere incompleto o modificato.");
  }

  const rawSeason = asRecord(rawPayload.activeSeason);
  const timelineMoment = rawSeason?.timeline_moment;
  if (
    !rawSeason
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
  const phaseDates = parsePhaseDates(rawSeason.phase_dates);

  const rawState = asRecord(rawPayload.leagueState);
  if (!rawState || !requiredStateArrays.every((key) => Array.isArray(rawState[key]))) {
    throw new Error("Stato della lega mancante o incompleto.");
  }
  const leagueState = normalizeState(rawState);
  if (!leagueState.teams.every(validTeam) || !leagueState.rosterEntries.every(validRosterEntry)) {
    throw new Error("Squadre o roster del backup non validi.");
  }

  const teamRecords = parseTeamRecords(rawPayload.teamRecords);
  validateTeamRecordConsistency(teamRecords, leagueState);

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

  const contractDrafts = parseContractDrafts(rawPayload.contractDrafts);

  if (!Array.isArray(rawPayload.movements) || rawPayload.movements.length > 50_000) {
    throw new Error("Registro movimenti non valido.");
  }
  const movements = rawPayload.movements.map(parseMovement);
  validateMovementReferences(movements);

  const payload: ImportableLeaguePayload = {
    activeSeason: {
      name: rawSeason.name,
      status: macroPhaseForMoment(timelineMoment),
      team_options_resolved: rawSeason.team_options_resolved,
      trade_deadline_passed: rawSeason.trade_deadline_passed,
      timeline_moment: timelineMoment,
      phase_dates: phaseDates,
    },
    teamRecords,
    leagueState,
    calendar,
    competitions,
    history,
    contractDrafts,
    movements,
  };

  return {
    format: importableBackupFormat,
    formatVersion: importableBackupFormatVersion,
    schemaVersion: typeof document.schemaVersion === "string" ? document.schemaVersion : "",
    exportedAt: document.exportedAt,
    checksum: checksumForPayload(payload),
    payload,
  };
}

function parsePhaseDates(input: unknown) {
  const rawDates = asRecord(input);
  if (!rawDates) throw new Error("Date delle fasi mancanti o non valide.");
  const allowedKeys = new Set<string>(datedLeagueTransitions);
  for (const [key, value] of Object.entries(rawDates)) {
    if (!allowedKeys.has(key) || !isPhaseDate(value)) {
      throw new Error("Date delle fasi mancanti o non valide.");
    }
  }
  return normalizePhaseDates(rawDates);
}

function parseTeamRecords(input: unknown) {
  if (!Array.isArray(input) || input.length > 100) throw new Error("Archivio delle squadre non valido.");
  const records = input.map(parseTeamRecord);
  for (const key of ["id", "code", "name", "slug"] as const) {
    if (new Set(records.map((record) => record[key])).size !== records.length) {
      throw new Error("Archivio delle squadre con valori duplicati.");
    }
  }
  return records;
}

function parseTeamRecord(input: unknown): ImportableTeamRecord {
  const row = asRecord(input);
  if (
    !row
    || typeof row.id !== "string"
    || !uuidPattern.test(row.id)
    || typeof row.code !== "string"
    || !/^[A-Z]{3}$/.test(row.code)
    || typeof row.name !== "string"
    || !row.name.trim()
    || typeof row.slug !== "string"
    || !row.slug.trim()
    || typeof row.owner_name !== "string"
    || !row.owner_name.trim()
    || (row.logo_url !== null && typeof row.logo_url !== "string")
    || typeof row.active !== "boolean"
  ) {
    throw new Error("Archivio delle squadre non valido.");
  }
  return {
    id: row.id,
    code: row.code,
    name: row.name.slice(0, 120),
    slug: row.slug.slice(0, 160),
    owner_name: row.owner_name.slice(0, 120),
    logo_url: row.logo_url === null ? null : row.logo_url.slice(0, 2_000),
    active: row.active,
  };
}

function validateTeamRecordConsistency(records: ImportableTeamRecord[], state: EditableLeagueState) {
  const activeRecordCodes = records.filter((record) => record.active).map((record) => record.code).sort();
  const stateCodes = state.teams.map((team) => team.code).sort();
  if (activeRecordCodes.length !== stateCodes.length || activeRecordCodes.some((code, index) => code !== stateCodes[index])) {
    throw new Error("Le squadre del backup non coincidono con lo stato della lega.");
  }
}

function parseContractDrafts(input: unknown) {
  if (!Array.isArray(input) || input.length > 10_000) throw new Error("Bozze dei contratti non valide.");
  const drafts = input.map(parseContractDraft);
  const keys = drafts.map((draft) => `${draft.season_name}\u0000${draft.team_code}\u0000${draft.player_name}`);
  if (new Set(keys).size !== keys.length) throw new Error("Bozze dei contratti duplicate.");
  return drafts;
}

function parseContractDraft(input: unknown): ImportableContractDraft {
  const row = asRecord(input);
  if (
    !row
    || typeof row.season_name !== "string"
    || !/^\d{4}\/\d{2}$/.test(row.season_name)
    || typeof row.team_code !== "string"
    || !/^[A-Z]{3}$/.test(row.team_code)
    || typeof row.player_name !== "string"
    || !row.player_name.trim()
    || typeof row.contract_kind !== "string"
    || !contractKinds.has(row.contract_kind)
    || typeof row.slot !== "string"
    || !contractSlots.has(row.slot)
  ) {
    throw new Error("Bozza di contratto non valida.");
  }
  return {
    season_name: row.season_name,
    team_code: row.team_code,
    player_name: row.player_name.slice(0, 200),
    contract_kind: row.contract_kind as ImportableContractDraft["contract_kind"],
    slot: row.slot as ImportableContractDraft["slot"],
  };
}

function parseMovement(input: unknown): ImportableMovement {
  const movement = asRecord(input);
  const beforeState = asRecord(movement?.before_state);
  const afterState = asRecord(movement?.after_state);
  const historyCategory = movement?.history_category ?? null;
  const beforeHistory = movement?.before_history ?? null;
  const afterHistory = movement?.after_history ?? null;
  const seasonName = movement?.season_name ?? null;
  const undoBeforeMoment = movement?.undo_before_moment ?? null;
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
    || (seasonName !== null && (typeof seasonName !== "string" || !/^\d{4}\/\d{2}$/.test(seasonName)))
    || (undoBeforeMoment !== null && !isLeagueMoment(undoBeforeMoment))
    || (revertsMovementId !== null && (typeof revertsMovementId !== "string" || !uuidPattern.test(revertsMovementId)))
    || typeof movement.created_at !== "string"
    || !Number.isFinite(Date.parse(movement.created_at))
    || (movement.reverted_at !== null && (
      typeof movement.reverted_at !== "string" || !Number.isFinite(Date.parse(movement.reverted_at))
    ))
    || (
      !Object.hasOwn(movement, "season_name")
      || !Object.hasOwn(movement, "undo_before_moment")
      || !Object.hasOwn(movement, "reverts_movement_id")
    )
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
    season_name: seasonName as string | null,
    undo_before_moment: undoBeforeMoment as LeagueMoment | null,
    reverts_movement_id: revertsMovementId as string | null,
    created_at: movement.created_at,
    reverted_at: movement.reverted_at,
  };
}

function validateMovementReferences(movements: ImportableMovement[]) {
  const ids = new Set(movements.map((movement) => movement.id));
  if (ids.size !== movements.length) throw new Error("Registro movimenti con identificativi duplicati.");
  if (movements.some((movement) => movement.reverts_movement_id && !ids.has(movement.reverts_movement_id))) {
    throw new Error("Registro movimenti con annullamenti incompleti.");
  }
}

async function fetchAllMovements(supabase: Supabase): Promise<ImportableMovement[]> {
  const pageSize = 500;
  const rows: ImportableMovement[] = [];
  for (let page = 0; page < 100; page += 1) {
    const from = page * pageSize;
    const response = await supabase
      .from("league_movements")
      .select("id,operation_type,summary,before_state,after_state,history_category,before_history,after_history,season_name,undo_before_moment,reverts_movement_id,created_at,reverted_at")
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
const contractKinds = new Set(["annual", "biennial", "triennial", "team_option"]);
const contractSlots = new Set(["regular", "two_way", "g_league"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
