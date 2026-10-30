import type { ActiveSeason } from "./active-season";
import { getRosterSlotLimits } from "./roster-slot-limits";
import type { EditableLeagueState } from "./league-state";
import type { RosterEntry } from "./league-types";
import type { RegulationArticle } from "./regulation";
import { entriesForDpeAdjustedCap, shouldShowDpeBadge, shouldShowDpeNoReintegrationBadge } from "./dpe-rules";
import { hasVisibleFourthDraftClause, isFourthDraftPick, publicDraftCondition } from "./future-draft-picks";
import { projectedDpeRosterOverflowByTeam } from "./league-advance";
import { hasReachedMoment, leagueMomentFromSeason } from "./league-moments";
import { showPlayerListRealTeam } from "./player-list-visibility";
import { buildPublicPlayerListRows, publicPlayerStatus } from "./public-player-list";
import { qualifyingOfferDisplayRole } from "./qualifying-offer-role";
import { dpeCountsForRoleMinimums, roleMinimumChecksApply } from "./role-minimums";
import { isPendingAuctionContractForDisplay } from "./roster-contract-display";
import { countRosterRoles, roleMinimumDeficits } from "./rules/roster";
import { shouldShowScheduledCutBadge } from "./season-end-cuts";
import { calculateCapSpace, followingSeasonName, shouldCountTeamOptions } from "./season-time";
import { isStretchUnavailable } from "./stretch-provision";
import { isRookieExtensionDecisionDue } from "./team-option-contract";

type PublicSeason = Pick<ActiveSeason, "name" | "status" | "timeline_moment" | "team_options_resolved">;

/** Explicit public projection: never serialize the editable state or private contract drafts. */
export function buildPublicLeagueContext(state: EditableLeagueState, season: PublicSeason, articles: RegulationArticle[]) {
  const moment = leagueMomentFromSeason(season);
  const postAuction = hasReachedMoment(moment, "auction_completed");
  const pendingContracts = hasReachedMoment(moment, "auction_start") && !hasReachedMoment(moment, "contract_delivery");
  const duringAuction = hasReachedMoment(moment, "auction_start") && !postAuction;
  const published = state.playerListStatus === "published";
  const showRealTeam = showPlayerListRealTeam(state.playerListStatus, moment);
  const countTeamOptions = shouldCountTeamOptions(season.status, season.team_options_resolved);
  const players = new Map(state.playerList.map((player) => [normalizeName(player.name), player]));
  const overflow = postAuction ? projectedDpeRosterOverflowByTeam({
    seasonName: season.name,
    rosterEntries: state.rosterEntries,
    qualifyingOfferRights: state.qualifyingOfferRights,
    playerList: state.playerList,
  }) : {};

  function publicPlayer(entry: RosterEntry) {
    const player = state.playerList.find((item) => normalizeName(item.name) === normalizeName(entry.name));
    const pending = pendingContracts && isPendingAuctionContractForDisplay(entry, season.name);
    const optionEligible = entry.auctionAcquisition !== "restricted_free_agent"
      && Boolean(player?.rookie || (player?.under23 && (entry.auctionPrice ?? entry.cost) <= 15));
    return {
      nome: entry.name,
      ...(entry.state === "cut" ? { stretchNonDisponibile: isStretchUnavailable(entry) } : { ruolo: entry.role ?? "X" }),
      scadenza: pending ? optionEligible ? "? T.O." : "?"
        : isRookieExtensionDecisionDue(entry, season.name) ? "R.E."
          : publicContractText(entry.contract),
      costo: entry.cost,
      bollini: [
        ...(shouldShowDpeNoReintegrationBadge(entry, moment) ? ["NO R."] : []),
        ...(shouldShowDpeBadge(entry, season.name, moment) ? ["DPE"] : []),
        ...(entry.state === "active" && entry.playoffTeamOptionUsedSeason ? ["PLAYOFF"] : []),
        ...(shouldShowScheduledCutBadge(entry, season.name, moment) ? ["T.P."] : []),
      ],
    };
  }

  const articleNumbers = new Map(articles.map((article) => [article.label, article.number]));
  return {
    squadre: state.teams.map((team) => {
      const entries = state.rosterEntries.filter((entry) => entry.teamCode === team.code);
      const active = entries.filter((entry) => entry.state === "active");
      const roles = countRosterRoles(active.map((entry) => {
        const role = players.get(normalizeName(entry.name))?.role;
        return { slot: entry.slot, role: role === "X" ? undefined : role };
      }), dpeCountsForRoleMinimums(moment));
      const missing = roleMinimumDeficits(roles);
      const hasMissing = Object.values(missing).some((count) => count > 0);
      const visiblePicks = state.draftAssets.filter((asset) => asset.teamCode === team.code
        && (!isFourthDraftPick(asset, state.draftAssets) || hasVisibleFourthDraftClause(asset)));
      const publicSlot = (slot: RosterEntry["slot"]) => active.filter((entry) => entry.slot === slot).map(publicPlayer);
      return {
        sigla: team.code,
        nome: team.name,
        proprietari: team.owner,
        capLibero: [season.name, followingSeasonName(season.name), followingSeasonName(season.name, 2)]
          .map((annata, distance) => ({ annata, crediti: calculateCapSpace({
            entries: entriesForDpeAdjustedCap(entries, distance),
            seasonName: annata,
            optionSeasonName: season.name,
            countTeamOptions,
          }) })),
        ruoli: roles,
        ...(published && (duringAuction || (roleMinimumChecksApply(season.status, moment) && hasMissing))
          ? { daAcquistare: missing } : {}),
        ...(active.some((entry) => entry.slot === "dpe") && overflow[team.code] > 0
          ? { slotRosterDaLiberarePerReintegroDpe: overflow[team.code] } : {}),
        roster: publicSlot("regular"),
        twoWay: publicSlot("two_way"),
        slotTwoWayUtilizzabili: getRosterSlotLimits(state).two_way,
        gLeague: publicSlot("g_league"),
        dpe: publicSlot("dpe"),
        tagliati: entries.filter((entry) => entry.state === "cut").map(publicPlayer),
        numeroScelteScambiabili: visiblePicks.filter((asset) => !isFourthDraftPick(asset, state.draftAssets)).length,
        scelte: visiblePicks.map((asset) => ({
          anno: asset.year,
          giro: asset.round,
          origineOPosizione: asset.originOrOverall,
          clausola: `${isFourthDraftPick(asset, state.draftAssets) ? "Non scambiabile · " : ""}${publicDraftCondition(asset.label)}`,
        })),
        ...(!postAuction ? { qualifyingOffer: state.qualifyingOfferRights.filter((right) => right.teamCode === team.code)
          .map((right) => ({
            nome: right.playerName,
            ruolo: qualifyingOfferDisplayRole(right, state.playerList, published),
            importo: right.qualifyingAmount,
          })) } : {}),
      };
    }),
    listone: {
      ufficiale: published,
      giocatori: buildPublicPlayerListRows(state).map((row) => ({
        nome: row.name,
        ruolo: row.role,
        ...(!postAuction ? { numero: row.publicOrder, rookie: row.rookie, under23: row.under23 } : {}),
        ...(showRealTeam ? { squadraNba: row.realTeam } : {}),
        squadra: row.rosterTeamCode ?? row.qualifyingTeamCode,
        stato: { fa: "FA", qo: "Q.O.", roster: "Roster", expiring: "In scad.", not_expiring: "Non in scad.", pending: "Da ass." }
          [publicPlayerStatus(row, season.name, postAuction)],
      })),
    },
    regolamento: articles.map((article) => ({
      numero: article.number,
      titolo: article.title,
      commi: article.clauses.map((clause) => clause.replace(/\\ref\{([^}]+)\}/g, (_match, label: string) => String(articleNumbers.get(label) ?? label))),
    })),
  };
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("it-IT");
}

function publicContractText(value: string) {
  if (!value) return "—";
  if (value === "T.O.") return value;
  return [
    value.match(/\d{2}/)?.[0] ?? value,
    ...(value.includes("(E)") ? ["EXT"] : []),
    ...(value.includes("(Q)") ? ["→ Q.O."] : []),
    ...(value.includes("+ R.E.") ? ["+ R.E."] : []),
    ...(value.includes("+ T.O.") ? ["+ T.O."] : []),
  ].join(" ");
}
