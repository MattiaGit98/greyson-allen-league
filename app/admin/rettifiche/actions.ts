"use server";

import { revalidatePath } from "next/cache";
import { loadEditableLeagueState, type EditableLeagueState } from "@/lib/league-state";
import { findTeamSlotOverflows, slotOverflowMessage } from "@/lib/roster-slot-limits";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LeagueEditorSaveState = { message?: string; error?: string };

export async function saveTeamCorrection(
  _previousState: LeagueEditorSaveState,
  formData: FormData,
): Promise<LeagueEditorSaveState> {
  const teamCode = String(formData.get("team_code") ?? "").trim().toUpperCase();
  const state = await loadEditableLeagueState();
  if (!state.teams.some((team) => team.code === teamCode)) return { error: "Squadra non valida." };

  try {
    const rosterEntries = parseRosterEntries(formData.get("roster_json"), teamCode);
    const slotErrors = findTeamSlotOverflows(rosterEntries, teamCode).map(slotOverflowMessage);
    if (slotErrors.length) {
      throw new Error(`${slotErrors.join(" ")} Libera prima uno slot adeguato e poi salva le rettifiche.`);
    }
    const draftAssets = parseDraftAssets(formData.get("draft_json"), teamCode);
    const qualifyingOfferRights = parseQualifyingOffers(formData.get("qo_json"), teamCode);
    const nextState: EditableLeagueState = {
      ...state,
      rosterEntries: [
        ...state.rosterEntries.filter((entry) => entry.teamCode !== teamCode),
        ...rosterEntries,
      ],
      draftAssets: [
        ...state.draftAssets.filter((asset) => asset.teamCode !== teamCode),
        ...draftAssets,
      ],
      qualifyingOfferRights: [
        ...state.qualifyingOfferRights.filter((right) => right.teamCode !== teamCode),
        ...qualifyingOfferRights,
      ],
    };
    return await persistLeagueState(nextState, "Rettifiche salvate.");
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Dati non validi." };
  }
}

export async function saveTeamIdentity(
  _previousState: LeagueEditorSaveState,
  formData: FormData,
): Promise<LeagueEditorSaveState> {
  const originalCode = String(formData.get("original_code") ?? "").trim().toUpperCase();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  const owner = String(formData.get("owner") ?? "").trim();
  if (!/^[A-Z0-9]{2,5}$/.test(code)) return { error: "La sigla deve contenere da 2 a 5 lettere o numeri." };
  if (!name || name.length > 100) return { error: "Inserisci un nome squadra valido." };
  if (!owner || owner.length > 200) return { error: "Inserisci almeno un proprietario." };

  const state = await loadEditableLeagueState();
  if (!state.teams.some((team) => team.code === originalCode)) return { error: "Squadra non valida." };
  if (state.teams.some((team) => team.code !== originalCode && team.code === code)) {
    return { error: "Questa sigla è già utilizzata." };
  }
  if (state.teams.some((team) => team.code !== originalCode && team.name.toLocaleLowerCase("it") === name.toLocaleLowerCase("it"))) {
    return { error: "Questo nome squadra è già utilizzato." };
  }

  const nextState: EditableLeagueState = {
    ...state,
    teams: state.teams.map((team) => team.code === originalCode
      ? { ...team, code, name, owner, slug: code.toLocaleLowerCase("it") }
      : team),
    rosterEntries: state.rosterEntries.map((entry) => entry.teamCode === originalCode
      ? { ...entry, teamCode: code }
      : entry),
    draftAssets: state.draftAssets.map((asset) => asset.teamCode === originalCode
      ? { ...asset, teamCode: code }
      : asset),
    qualifyingOfferRights: state.qualifyingOfferRights.map((right) => right.teamCode === originalCode
      ? { ...right, teamCode: code }
      : right),
  };
  const saved = await persistLeagueState(nextState, "Squadra aggiornata.");
  if (saved.error) return saved;
  await synchronizeTeamIdentity(originalCode, code, name, owner);
  return saved;
}

async function persistLeagueState(state: EditableLeagueState, message: string): Promise<LeagueEditorSaveState> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Supabase non configurato." };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sessione scaduta." };
  const response = await supabase.rpc("replace_league_state", { state_payload: state });
  if (response.error) return { error: response.error.message };

  [
    "/squadre",
    "/giocatori",
    "/admin",
    "/admin/rettifiche",
    "/admin/squadre-proprietari",
    "/admin/free-agent",
    "/admin/scambi",
  ].forEach((path) => revalidatePath(path));
  return { message };
}

async function synchronizeTeamIdentity(originalCode: string, code: string, name: string, owner: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return;
  await supabase
    .from("teams")
    .update({ code, name, owner_name: owner, slug: code.toLocaleLowerCase("it") })
    .eq("code", originalCode);

  if (originalCode === code) return;
  const content = await supabase.from("competition_content").select("id,content");
  if (content.error) return;
  await Promise.all((content.data ?? []).map((row) => supabase
    .from("competition_content")
    .update({ content: replaceStringValue(row.content, originalCode, code) })
    .eq("id", row.id)));
}

function replaceStringValue(value: unknown, previous: string, next: string): unknown {
  if (value === previous) return next;
  if (Array.isArray(value)) return value.map((item) => replaceStringValue(item, previous, next));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => (
    [key === previous ? next : key, replaceStringValue(item, previous, next)]
  )));
}

function parseJson(value: FormDataEntryValue | null) {
  const parsed: unknown = JSON.parse(String(value ?? "[]"));
  if (!Array.isArray(parsed)) throw new Error("Il contenuto non è valido.");
  return parsed;
}

function parseRosterEntries(value: FormDataEntryValue | null, teamCode: string) {
  const rows = parseJson(value);
  if (rows.length > 100) throw new Error("Troppe righe nel roster.");
  return rows.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Riga roster non valida.");
    const row = item as Record<string, unknown>;
    const name = cleanText(row.name, 120, "nome del giocatore");
    const cost = cleanInteger(row.cost, 0, 10000, "costo");
    const contract = cleanText(row.contract, 40, "contratto");
    const role = row.role === "G" || row.role === "A" || row.role === "C" ? row.role : undefined;
    const slot = row.slot === "two_way" || row.slot === "g_league" || row.slot === "dpe" ? row.slot : "regular";
    const state = row.state === "cut" ? "cut" : "active";
    const stretchProvisionApplied = row.stretchProvisionApplied === true;
    const buyoutApplied = row.buyoutApplied === true;
    const auctionAcquisition = row.auctionAcquisition === "qualifying_offer" || row.auctionAcquisition === "restricted_free_agent"
      ? row.auctionAcquisition
      : undefined;
    const auctionPrice = Number.isInteger(Number(row.auctionPrice)) && Number(row.auctionPrice) >= 1
      ? Number(row.auctionPrice)
      : undefined;
    const originalContractYears = row.originalContractYears === 1 || row.originalContractYears === 2 || row.originalContractYears === 3
      ? row.originalContractYears
      : undefined;
    const lastExtensionSeason = typeof row.lastExtensionSeason === "string" && /^\d{4}\/\d{2}$/.test(row.lastExtensionSeason)
      ? row.lastExtensionSeason
      : undefined;
    const isPendingTeamOptionDoubling = /\((?:2X|X2)\)/i.test(contract);
    const teamOptionBaseCost = isPendingTeamOptionDoubling
      ? cost
      : Number.isInteger(Number(row.teamOptionBaseCost)) && Number(row.teamOptionBaseCost) >= 0
        ? Number(row.teamOptionBaseCost)
        : undefined;
    const optionFinalShortYear = contract.match(/\d{2}/)?.[0];
    const teamOptionFinalYear = isPendingTeamOptionDoubling && optionFinalShortYear
      ? 2000 + Number(optionFinalShortYear)
      : Number.isInteger(Number(row.teamOptionFinalYear)) && Number(row.teamOptionFinalYear) >= 2000
        ? Number(row.teamOptionFinalYear)
        : undefined;
    const freeAgentSignedSeason = typeof row.freeAgentSignedSeason === "string" && /^\d{4}\/\d{2}$/.test(row.freeAgentSignedSeason)
      ? row.freeAgentSignedSeason
      : undefined;
    const endedPreviousSeasonInGLeague = row.endedPreviousSeasonInGLeague === true;
    const contractStartSeason = typeof row.contractStartSeason === "string" && /^\d{4}\/\d{2}$/.test(row.contractStartSeason)
      ? row.contractStartSeason
      : undefined;
    const twoWayPromotionLocked = row.twoWayPromotionLocked === true;
    const playoffTeamOptionPromotionSeason = typeof row.playoffTeamOptionPromotionSeason === "string" && /^\d{4}\/\d{2}$/.test(row.playoffTeamOptionPromotionSeason)
      ? row.playoffTeamOptionPromotionSeason
      : undefined;
    return { name, cost, contract, role, slot, state, teamCode, stretchProvisionApplied, buyoutApplied, auctionAcquisition, auctionPrice, originalContractYears, lastExtensionSeason, teamOptionBaseCost, teamOptionFinalYear, freeAgentSignedSeason, endedPreviousSeasonInGLeague, contractStartSeason, twoWayPromotionLocked, playoffTeamOptionPromotionSeason } as const;
  });
}

function parseDraftAssets(value: FormDataEntryValue | null, teamCode: string) {
  const rows = parseJson(value);
  if (rows.length > 100) throw new Error("Troppe righe nelle scelte.");
  return rows.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Riga scelta non valida.");
    const row = item as Record<string, unknown>;
    return {
      label: cleanText(row.label, 500, "clausola della scelta", true) || "Scelta",
      round: cleanText(row.round, 40, "giro"),
      year: cleanInteger(row.year, 2020, 2100, "anno del draft"),
      originOrOverall: cleanText(row.originOrOverall, 60, "squadra o posizione"),
      teamCode,
    };
  });
}

function parseQualifyingOffers(value: FormDataEntryValue | null, teamCode: string) {
  const rows = parseJson(value);
  if (rows.length > 100) throw new Error("Troppe qualifying offer.");
  return rows.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Qualifying offer non valida.");
    const row = item as Record<string, unknown>;
    return {
      playerName: cleanText(row.playerName, 120, "nome del giocatore"),
      qualifyingAmount: cleanInteger(row.qualifyingAmount, 1, 10000, "importo Q.O."),
      teamCode,
    };
  });
}

function cleanText(value: unknown, maxLength: number, label: string, allowEmpty = false) {
  const text = typeof value === "string" ? value.trim() : String(value ?? "").trim();
  if ((!text && !allowEmpty) || text.length > maxLength) throw new Error(`Valore non valido: ${label}.`);
  return text;
}

function cleanInteger(value: unknown, minimum: number, maximum: number, label: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new Error(`Valore non valido: ${label}.`);
  }
  return number;
}
