import { result } from "./types";

export type QualifyingOfferEligibility = {
  wasCutBeforeExpiry: boolean;
  teamOptionExercised: boolean;
  oneCreditAnnualAuctionContract: boolean;
  freeAgentSignedBeforeDeadline: boolean;
};

export function evaluateQualifyingOfferEligibility(input: QualifyingOfferEligibility) {
  const eligibleCategory = input.teamOptionExercised
    || input.oneCreditAnnualAuctionContract
    || input.freeAgentSignedBeforeDeadline;
  const errors = [];
  if (input.wasCutBeforeExpiry) {
    errors.push({ code: "QO_CUT_BEFORE_EXPIRY", message: "Il diritto QO non è disponibile perché il giocatore è stato tagliato o liberato prima della scadenza." });
  }
  if (!eligibleCategory) {
    errors.push({ code: "QO_CATEGORY_NOT_ELIGIBLE", message: "Il contratto non rientra in una categoria ammessa alla qualifying offer." });
  }
  return result({ eligible: errors.length === 0 }, ["8(a)"], errors);
}

export function evaluateQualifyingOfferExtension(qualifyingAmount: number, phase: "offseason" | "auction" | "regular_season") {
  const errors = [];
  if (phase !== "auction") errors.push({ code: "QO_ONLY_AT_AUCTION", message: "La qualifying offer può essere estesa quando il giocatore viene chiamato all’asta." });
  if (!Number.isInteger(qualifyingAmount) || qualifyingAmount < 1) errors.push({ code: "INVALID_QO_AMOUNT", message: "L’importo QO non è valido." });
  return result({ openingBid: qualifyingAmount, contractYearsIfAccepted: 1 }, ["8(b)", "8(e)"], errors);
}
