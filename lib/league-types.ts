export type LeaguePhase = "offseason" | "auction" | "regular_season";

export type AuctionAcquisitionKind = "qualifying_offer" | "restricted_free_agent";

export type PlayerListEntry = {
  name: string;
  role: "G" | "A" | "C" | "X";
  realTeam: string;
  rookie: boolean;
  under23: boolean;
};

export type RosterEntry = {
  name: string;
  cost: number;
  contract: string;
  role?: "G" | "A" | "C";
  state: "active" | "cut";
  slot: "regular" | "two_way" | "g_league" | "dpe";
  teamCode: string;
  stretchProvisionApplied?: boolean;
  buyoutApplied?: boolean;
  auctionAcquisition?: AuctionAcquisitionKind;
  auctionPrice?: number;
  originalContractYears?: 1 | 2 | 3;
  lastExtensionSeason?: string;
  teamOptionBaseCost?: number;
  teamOptionFinalYear?: number;
  freeAgentSignedSeason?: string;
  endedPreviousSeasonInGLeague?: boolean;
  contractStartSeason?: string;
  twoWayPromotionLocked?: boolean;
  playoffTeamOptionPromotionSeason?: string;
  dpeAppliedSeasons?: string[];
  scheduledSeasonEndCut?: string;
};

export type QualifyingOfferRight = {
  playerName: string;
  qualifyingAmount: number;
  teamCode: string;
  role?: PlayerListEntry["role"];
};

export type DraftClauseResolution = {
  agreementId: string;
  role: "protected" | "protection_counterparty" | "swap_right" | "swap_subject";
  subjectYear: number;
  subjectRound?: string;
  subjectOriginTeamCode: string;
  counterpartYear: number;
  counterpartRound?: string;
  counterpartOriginTeamCode: string;
  threshold?: number;
  originalOwnerTeamCode: string;
};

export type DraftAsset = {
  label: string;
  round: string;
  year: number;
  originOrOverall: string | number;
  teamCode: string;
  originTeamCode?: string;
  isBonus?: boolean;
  draftCost?: number;
  clauseResolution?: DraftClauseResolution;
};

export type TeamSummary = {
  code: string;
  name: string;
  owner: string;
  credits: number;
  cost: number;
  players: number;
  cutPlayers: number;
  qualifyingOffers: number;
  draftAssets: number;
  nextSeasonCredits: number;
  followingSeasonCredits: number;
  slug: string;
};
