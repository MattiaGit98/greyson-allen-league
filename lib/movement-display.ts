const operationLabels: Record<string, string> = {
  acquisto_asta: "Acquisto asta",
  modifica_asta: "Modifica asta",
  qualifying_offer_non_estesa: "Q.O. non estesa",
  team_option: "Team option",
  team_option_playoff: "Team option playoff",
  firma_free_agent: "Firma free agent",
  estensione_contrattuale: "Estensione contrattuale",
  spostamento_slot: "Spostamento slot",
  dpe_activate: "Esercizio DPE",
  dpe_reintegrate: "Reintegro DPE",
  cut: "Taglio",
  free_release: "Rilascio gratuito",
  buyout: "Buyout",
  stretch_provision: "Stretch provision",
  scambio: "Scambio",
  sign_and_trade: "Sign and trade",
  scelta_draft: "Scelta draft",
  ordine_draft_finale: "Ordine draft finale",
  consegna_contratti: "Consegna contratti completata",
  movimento_annullato: "Movimento annullato",
  rettifica_roster_contratto: "Rettifica dell'admin",
  rettifica_roster_rimozione: "Rettifica dell'admin",
  rettifica_roster_aggiunta: "Rettifica dell'admin",
};

const movementFilterGroups = [
  { value: "asta", label: "Asta", operationTypes: ["acquisto_asta", "modifica_asta"] },
  { value: "dpe", label: "DPE", operationTypes: ["dpe_activate", "dpe_reintegrate"] },
  { value: "estensioni", label: "Estensioni contrattuali", operationTypes: ["estensione_contrattuale"] },
  { value: "free_agent", label: "Free agent", operationTypes: ["firma_free_agent"] },
  { value: "movimenti_annullati", label: "Movimenti annullati", operationTypes: ["movimento_annullato"] },
  { value: "procedure_stagionali", label: "Procedure stagionali", operationTypes: ["ordine_draft_finale", "consegna_contratti"] },
  { value: "qualifying_offer", label: "Qualifying offer", operationTypes: ["qualifying_offer_non_estesa"] },
  { value: "rettifiche_admin", label: "Rettifiche dell'admin", operationTypes: ["rettifica_roster_contratto", "rettifica_roster_rimozione", "rettifica_roster_aggiunta"] },
  { value: "scambi", label: "Scambi", operationTypes: ["scambio", "sign_and_trade"] },
  { value: "scelte_draft", label: "Scelte draft", operationTypes: ["scelta_draft"] },
  { value: "slot", label: "Spostamenti slot", operationTypes: ["spostamento_slot"] },
  { value: "tagli_rilasci", label: "Tagli e rilasci", operationTypes: ["cut", "free_release", "buyout", "stretch_provision"] },
  { value: "team_option", label: "Team option", operationTypes: ["team_option", "team_option_playoff"] },
] as const;

export const movementFilterOptions = movementFilterGroups
  .map(({ value, label }) => ({ value, label }))
  .sort((left, right) => left.label.localeCompare(right.label, "it"));

export function movementOperationTypesForFilter(value: string) {
  return movementFilterGroups.find((group) => group.value === value)?.operationTypes ?? null;
}

export function movementOperationLabel(operationType: string) {
  const normalized = operationType.trim().toLocaleLowerCase("it-IT");
  return operationLabels[normalized] ?? capitalize(normalized.replaceAll("_", " "));
}

export function normalizeMovementSearchQuery(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 80);
}

export function movementSearchFilter(value: string) {
  const query = normalizeMovementSearchQuery(value);
  const tokens = query
    .replace(/[^\p{L}\p{N}-]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!tokens.length) return null;
  const pattern = tokens.join("%");
  const normalizedTokens = tokens.map(searchKey);
  const matchingTypes = Object.entries(operationLabels)
    .filter(([operationType, label]) => {
      const searchable = searchKey(`${operationType.replaceAll("_", " ")} ${label}`);
      return normalizedTokens.every((token) => searchable.includes(token));
    })
    .map(([operationType]) => operationType);
  return [
    `summary.ilike.%${pattern}%`,
    `operation_type.ilike.%${pattern}%`,
    ...(matchingTypes.length ? [`operation_type.in.(${matchingTypes.join(",")})`] : []),
  ].join(",");
}

export function conciseMovementDetail(operationType: string, summary: string) {
  const normalizedType = operationType.trim().toLocaleLowerCase("it-IT");
  const forcedCap = /(?:^|[;·])\s*CAP FORZATO\s*$/i.test(summary);
  const detail = normalize(summary.replace(/\s*[;·]\s*CAP FORZATO\s*$/i, ""));
  let concise = detail;

  if (["team_option", "team_option_playoff", "estensione_contrattuale"].includes(normalizedType)) {
    concise = firstSegment(detail);
  } else if (["acquisto_asta", "firma_free_agent"].includes(normalizedType)) {
    concise = conciseAcquisition(detail);
  } else if (["cut", "free_release", "buyout"].includes(normalizedType)) {
    concise = firstSegment(detail);
  } else if (normalizedType === "stretch_provision") {
    concise = firstSegment(detail).replace(/\s+da\s+\d+\s+crediti\b.*$/i, "");
  } else if (["dpe_activate", "dpe_reintegrate"].includes(normalizedType)) {
    concise = firstSegments(detail, 2);
  } else if (normalizedType === "scelta_draft") {
    concise = firstSegment(detail).replace(/\s+per\s+\d+\s+crediti\b.*$/i, "");
  } else if (["scambio", "sign_and_trade"].includes(normalizedType)) {
    concise = conciseTrade(detail);
  } else if (normalizedType === "rettifica_roster_rimozione") {
    concise = conciseRosterCorrection(detail, "rimosso");
  } else if (normalizedType === "rettifica_roster_contratto") {
    concise = conciseRosterCorrection(detail, "contratto rettificato");
  } else if (normalizedType === "rettifica_roster_aggiunta") {
    concise = firstSegment(detail);
  } else if (normalizedType === "ordine_draft_finale") {
    concise = detail.split(":", 1)[0] ?? detail;
  } else if (normalizedType === "modifica_asta") {
    const priceCorrection = detail.match(/^(.+?):\s*prezzo modificato da \d+ a \d+(?: per ([A-Z0-9_-]+))?$/i);
    concise = priceCorrection
      ? `${priceCorrection[1]}${priceCorrection[2] ? ` (${priceCorrection[2]})` : ""}: prezzo rettificato`
      : detail;
  }

  return normalize(`${concise}${forcedCap ? " · CAP FORZATO" : ""}`);
}

function conciseAcquisition(value: string) {
  const segments = splitSegments(value);
  const main = (segments[0] ?? value).replace(/\s+per\s+\d+\s+crediti\b.*$/i, "");
  const contextualCut = segments.find((segment) => /^taglio contestuale di\s+/i.test(segment));
  return [main, contextualCut].filter(Boolean).join("; ");
}

function conciseTrade(value: string) {
  return normalize(value
    .replace(/Firma free agent\s*·\s*([A-Z0-9_-]+)\s*·\s*\d+\s*crediti\s*·\s*(?:Roster|Two-way|G-League|DPE)/gi, "Firma free agent: $1")
    .replace(/Scelta #(\d+)\s*·\s*([A-Z0-9_-]+)\s*·\s*\d+\s*crediti\s*·\s*(?:Roster|Two-way|G-League|DPE)/gi, "Scelta #$1: $2")
    .replace(/;\s*(Roster|Two-way|G-League|DPE)\s*→\s*\1(?=;|$)/gi, "")
    .replace(/;\s*\d+\s+crediti,\s*contratto\s+[^;]+/gi, "")
    .replace(/;\s*importo\s+\d+/gi, "")
    .replace(/;\s*;+/g, ";"));
}

function conciseRosterCorrection(value: string, result: string) {
  const match = value.match(/^(.+?)\s+\(([A-Z0-9_-]+)(?:,\s*[^)]+)?\):/i);
  return match ? `${match[1]} (${match[2]}): ${result}` : firstSegment(value);
}

function firstSegment(value: string) {
  return splitSegments(value)[0] ?? value;
}

function firstSegments(value: string, count: number) {
  return splitSegments(value).slice(0, count).join("; ");
}

function splitSegments(value: string) {
  return value.split(/\s*[;·]\s*/).map((segment) => segment.trim()).filter(Boolean);
}

function normalize(value: string) {
  return value
    .replace(/\s*;\s*/g, "; ")
    .replace(/\s*·\s*/g, " · ")
    .replace(/\s+/g, " ")
    .replace(/[;·]\s*$/, "")
    .trim();
}

function capitalize(value: string) {
  return value ? `${value[0].toLocaleUpperCase("it-IT")}${value.slice(1)}` : value;
}

function searchKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("it-IT");
}
