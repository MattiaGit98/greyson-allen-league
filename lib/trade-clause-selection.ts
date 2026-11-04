import type { TradePickClause, TradePickClauseAgreement } from "./rules/trade";

type ClausePick = { id: string; year: number; round: string; tradable: boolean; hasExistingCondition: boolean };
type PickRow<T extends ClausePick> = { pick: T; ownerTeamCode: string };
type SelectionContext<T extends ClausePick> = {
  allPicks: PickRow<T>[];
  participantCodes: string[];
  postTradeOwner: (pickId: string) => string;
  canReuseConditionedPick: (pick: T) => boolean;
  protectionCounterpartyDraftYears: number[];
};

export function tradeClauseBeneficiary(clause: TradePickClause, subjectOwner: string, counterpartyOwner: string) {
  return clause === "swap" ? subjectOwner : clause.startsWith("protected_top_") ? counterpartyOwner : "";
}

export function tradeClausePickOptions<T extends ClausePick>(input: SelectionContext<T> & {
  teamCode: string;
  clause: TradePickClause;
  selectedPickId: string;
  reservedPickIds: ReadonlySet<string>;
}) {
  const available = input.allPicks.filter(({ pick }) => input.participantCodes.includes(input.postTradeOwner(pick.id))
    && input.canReuseConditionedPick(pick) && !input.reservedPickIds.has(pick.id));
  const subjects = available.filter(({ pick }) => pick.tradable && (
    input.clause === "swap" ? input.postTradeOwner(pick.id) === input.teamCode
      : input.clause.startsWith("protected_top_") && input.postTradeOwner(pick.id) !== input.teamCode
  ));
  const subject = subjects.find(({ pick }) => pick.id === input.selectedPickId)?.pick;
  const counterparties = !subject ? [] : available.filter(({ pick }) => pick.id !== subject.id && (
    input.clause === "swap"
      ? pick.tradable && input.postTradeOwner(pick.id) !== input.teamCode && pick.year === subject.year && pick.round === subject.round
      : input.postTradeOwner(pick.id) === input.teamCode
        && input.protectionCounterpartyDraftYears.includes(pick.year)
        && (pick.year > subject.year || (pick.year === subject.year && subject.round.trim().startsWith("1") && pick.round.trim().startsWith("2")))
  ));
  return { subjects, counterparties };
}

/** Conserva solo gli accordi ancora coerenti con lo scambio, aggiornandone i proprietari finali. */
export function reconcileTradePickClauses<T extends TradePickClauseAgreement, P extends ClausePick>(
  agreements: T[], context: SelectionContext<P>,
): T[] {
  const reserved = new Set<string>();
  return agreements.flatMap((agreement) => {
    const options = tradeClausePickOptions({ ...context, teamCode: agreement.beneficiaryTeamCode,
      clause: agreement.clause, selectedPickId: agreement.pickId, reservedPickIds: reserved });
    const subject = options.subjects.find(({ pick }) => pick.id === agreement.pickId);
    const counterparty = options.counterparties.find(({ pick }) => pick.id === agreement.counterpartyPickId);
    if (!context.participantCodes.includes(agreement.beneficiaryTeamCode) || !subject || !counterparty) return [];
    reserved.add(subject.pick.id);
    reserved.add(counterparty.pick.id);
    return [{ ...agreement,
      postTradeOwnerTeamCode: context.postTradeOwner(subject.pick.id),
      counterpartyPostTradeOwnerTeamCode: context.postTradeOwner(counterparty.pick.id),
      hasExistingCondition: subject.pick.hasExistingCondition && !context.canReuseConditionedPick(subject.pick),
      counterpartyHasExistingCondition: counterparty.pick.hasExistingCondition && !context.canReuseConditionedPick(counterparty.pick),
    }];
  });
}
