import { validateCapOperation } from "./credits";
import { validateRoleMinimums, validateSlots, type RoleCounts, type SlotCounts } from "./roster";
import { result } from "./types";
import { seasonEndYear } from "../season-time";

export function automaticFreeAgentContract(seasonName: string, tradeDeadlinePassed: boolean) {
  const endYear = seasonEndYear(seasonName);
  if (endYear === null) return null;
  const expiry = String(endYear).slice(-2);
  return tradeDeadlinePassed ? expiry : `${expiry} (Q)`;
}

export function evaluateFreeAgentSigning(input: {
  phase: string;
  enforceRoleMinimums?: boolean;
  freeAgentThousandLimitApplies?: boolean;
  currentCost: number;
  contextualCutSavings?: number;
  price: number;
  destination: "regular" | "two_way";
  slots: SlotCounts;
  playerSelected: boolean;
  playerAlreadyOwned: boolean;
  qualifyingOfferActive: boolean;
  roles: RoleCounts;
  playerRole: "G" | "A" | "C" | null;
  cutRole: "G" | "A" | "C" | null;
  cutSlot: "regular" | "two_way" | "g_league" | "dpe" | null;
  promotionSourceSlot?: "regular" | "two_way" | "g_league" | null;
  promotionDestinationSlot?: "regular" | "two_way" | "g_league" | null;
  contextualCuts?: { role: "G" | "A" | "C" | null; slot: "regular" | "two_way" | "g_league" | "dpe" }[];
  contextualMoves?: { sourceSlot: "regular" | "two_way" | "g_league"; destinationSlot: "regular" | "two_way" | "g_league" }[];
}) {
  const errors = [];
  const warnings = [];

  if (input.phase !== "regular_season") {
    errors.push({
      code: "FREE_AGENCY_CLOSED",
      message: "La firma dei free agent è disponibile durante la stagione.",
    });
  }
  if (!input.playerSelected) {
    errors.push({ code: "PLAYER_REQUIRED", message: "Seleziona un giocatore dal listone." });
  }
  if (input.playerAlreadyOwned) {
    errors.push({ code: "PLAYER_ALREADY_OWNED", message: "Il giocatore appartiene già a una squadra." });
  }
  if (input.qualifyingOfferActive) {
    errors.push({
      code: "QUALIFYING_OFFER_ACTIVE",
      message: "Il giocatore è coperto da una qualifying offer e non è un free agent.",
    });
  }
  if (!Number.isInteger(input.price) || input.price < 1) {
    errors.push({ code: "INVALID_PRICE", message: "Il costo deve essere di almeno 1." });
  }
  if (input.destination === "two_way" && input.price > 10) {
    errors.push({
      code: "TWO_WAY_PRICE_LIMIT",
      message: "Un free agent può essere inserito nei two-way soltanto fino a 10 crediti.",
    });
  }

  const cap = validateCapOperation(
    input.currentCost,
    Math.max(0, input.price) - (input.contextualCutSavings ?? 0),
    "regular_season",
    true,
    input.freeAgentThousandLimitApplies ?? true,
  );
  if ((input.freeAgentThousandLimitApplies ?? true) && input.price > 1 && cap.calculated.after > 1000
    && !cap.errors.some((error) => error.code === "FREE_AGENT_MAX_ONE")) {
    cap.errors.push({ code: "FREE_AGENT_MAX_ONE", message: "Il free agent può essere acquistato solo a 1 credito." });
  }
  const slotsAfter = {
    ...input.slots,
    regular: input.slots.regular + (input.destination === "regular" ? 1 : 0),
    twoWay: input.slots.twoWay + (input.destination === "two_way" ? 1 : 0),
  };
  const contextualCuts = input.contextualCuts ?? (input.cutSlot ? [{ role: input.cutRole, slot: input.cutSlot }] : []);
  const contextualMoves = input.contextualMoves ?? (
    input.promotionSourceSlot && input.promotionDestinationSlot
      ? [{ sourceSlot: input.promotionSourceSlot, destinationSlot: input.promotionDestinationSlot }]
      : []
  );
  for (const cut of contextualCuts) {
    if (cut.slot === "regular") slotsAfter.regular -= 1;
    if (cut.slot === "two_way") slotsAfter.twoWay -= 1;
    if (cut.slot === "g_league") slotsAfter.gLeague -= 1;
    if (cut.slot === "dpe") slotsAfter.dpe -= 1;
  }
  for (const move of contextualMoves) {
    if (move.sourceSlot === "regular") slotsAfter.regular -= 1;
    if (move.sourceSlot === "two_way") slotsAfter.twoWay -= 1;
    if (move.sourceSlot === "g_league") slotsAfter.gLeague -= 1;
    if (move.destinationSlot === "regular") slotsAfter.regular += 1;
    if (move.destinationSlot === "two_way") slotsAfter.twoWay += 1;
    if (move.destinationSlot === "g_league") slotsAfter.gLeague += 1;
  }
  const slotCheck = validateSlots(slotsAfter);
  const rolesAfter = { ...input.roles };
  if (input.playerRole) rolesAfter[input.playerRole] += 1;
  for (const cut of contextualCuts) {
    if (cut.slot !== "dpe" && cut.role) rolesAfter[cut.role] -= 1;
  }
  const roleCheck = validateRoleMinimums(rolesAfter, input.enforceRoleMinimums ?? input.phase === "regular_season");
  errors.push(...slotCheck.errors);
  warnings.push(...cap.errors, ...cap.warnings, ...slotCheck.warnings);
  warnings.push(...roleCheck.errors.map((issue) => ({
    ...issue,
    message: `${issue.message} È necessario il ripristino previsto dal regolamento.`,
  })));

  return result(
    {
      costAfter: cap.calculated.after,
      spaceBefore: 1000 - input.currentCost,
      spaceAfter: 1000 - cap.calculated.after,
      slotsAfter,
      rolesAfter,
    },
    ["2(a)", "5(a)", "5(e)", (input.freeAgentThousandLimitApplies ?? true) ? "9(c)" : "9(d)", "11(b-c)"],
    errors,
    warnings,
  );
}
