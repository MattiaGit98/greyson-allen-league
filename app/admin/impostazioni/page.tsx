import { loadCurrentHistoryImports } from "@/lib/history-competition-store";
import {
  leagueMomentFromSeason,
  leagueMomentLabels,
  leagueMoments,
  macroPhaseForMoment,
  momentIndex,
  nextLeagueTransition,
} from "@/lib/league-moments";
import { loadEditableLeagueState } from "@/lib/league-state";
import { buildLeagueTransitionPreview } from "@/lib/league-transition";
import { phaseStepLabels } from "@/lib/phase-backups";
import { requireActiveSeason } from "@/lib/active-season";
import { PhaseAdvanceButton, RestorePhaseButton } from "./phase-advance-button";
import { loadPostAuctionContractDrafts } from "@/lib/post-auction-contract-store";
import { normalizePhaseDates, phaseDateForTransition } from "@/lib/phase-calendar";

export default async function LeagueSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; advanced?: string; stepped?: string; restored?: string }> }) {
  const [query, activeSeason, state, currentHistory] = await Promise.all([
    searchParams,
    requireActiveSeason(),
    loadEditableLeagueState(),
    loadCurrentHistoryImports(),
  ]);
  const { supabase, season, error: seasonError, configured } = activeSeason;
  const currentMoment = leagueMomentFromSeason(season);
  const contractDrafts = await loadPostAuctionContractDrafts(season.name);
  const transition = nextLeagueTransition(currentMoment);
  const phaseDates = normalizePhaseDates(season.phase_dates);
  const nextPhaseDate = phaseDateForTransition(phaseDates, transition);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date()).reduce((value, part) => ({ ...value, [part.type]: part.value }), {} as Record<string, string>);
  const todayIso = `${today.year}-${today.month}-${today.day}`;
  const nextSeasonName = transition === "season_end"
    ? `${Number(season.name.slice(0, 4)) + 1}/${String((Number(season.name.slice(0, 4)) + 2) % 100).padStart(2, "0")}`
    : season.name;
  const preview = buildLeagueTransitionPreview({
    currentMoment,
    seasonName: season.name,
    state,
    currentHistorySeason: currentHistory.season,
    contractDrafts,
  });
  const backupResponse = supabase
    ? await supabase.from("league_phase_backups").select("id,from_phase,to_phase,created_at").is("restored_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle()
    : null;
  const latestBackup = backupResponse?.data;

  return (
    <section className="section page-top admin-settings">
      {query.stepped && <p className="notice success">Passaggio completato: {phaseStepLabels[query.stepped] ?? query.stepped}.</p>}
      {query.advanced && <p className="notice success">Stagione conclusa. La lega è ora nell’offseason {query.advanced}.</p>}
      {query.restored && <p className="notice success">Situazione precedente ripristinata.</p>}
      {query.error && <p className="notice error">Operazione non riuscita: {query.error}</p>}
      {seasonError && <p className="notice error">Aggiornamento SQL dei momenti della lega non ancora applicato: {seasonError.message}</p>}
      {!supabase && <p className="notice">Configurazione non disponibile.</p>}

      <div className="league-moment-topline">
        <div><span>Macro-fase</span><strong>{macroPhaseForMoment(currentMoment) === "offseason" ? "Offseason" : "Stagione"}</strong></div>
        <div><span>Annata</span><strong>{season.name}</strong></div>
      </div>

      <section className="league-moment-board">
        <MomentGroup title="Offseason" moments={leagueMoments.slice(0, 3)} currentMoment={currentMoment} />
        <MomentGroup title="Stagione" moments={leagueMoments.slice(3)} currentMoment={currentMoment} includeSeasonEnd />
      </section>

      <section className="phase-progress-card moment-progress-card">
        <div><span>Ultimo momento concluso</span><strong>{season.name} · {leagueMomentLabels[currentMoment]}</strong></div>
        <b>→</b>
        <div><span>Prossimo passaggio</span><strong>{nextSeasonName} · {leagueMomentLabels[transition]}</strong></div>
        {configured
          ? <PhaseAdvanceButton currentLabel={`${season.name} · ${leagueMomentLabels[currentMoment]}`} nextLabel={`${nextSeasonName} · ${leagueMomentLabels[transition]}`} preview={preview} missingPhaseDate={!nextPhaseDate} />
          : <button className="button primary" type="button" disabled>Esegui il prossimo passaggio</button>}
      </section>

      {!nextPhaseDate && <p className="notice">Inserisci la data della prossima fase prima di poter avanzare.</p>}
      {nextPhaseDate && nextPhaseDate < todayIso && <p className="notice error">La data della prossima fase è trascorsa: avanza la lega oppure correggi il calendario della lega.</p>}
      {latestBackup && latestBackup.to_phase === currentMoment && (
        <section className="phase-restore-card">
          <div><span>Backup del passaggio precedente</span><strong>{phaseStepLabels[latestBackup.from_phase] ?? latestBackup.from_phase} → {phaseStepLabels[latestBackup.to_phase] ?? latestBackup.to_phase}</strong></div>
          <RestorePhaseButton backupId={latestBackup.id} transitionLabel={`${phaseStepLabels[latestBackup.from_phase] ?? latestBackup.from_phase} → ${phaseStepLabels[latestBackup.to_phase] ?? latestBackup.to_phase}`} />
        </section>
      )}
    </section>
  );
}

function MomentGroup({ title, moments, currentMoment, includeSeasonEnd = false }: { title: string; moments: readonly (typeof leagueMoments)[number][]; currentMoment: (typeof leagueMoments)[number]; includeSeasonEnd?: boolean }) {
  return (
    <section className="league-moment-group">
      <span>{title}</span>
      <div>
        {moments.map((moment) => {
          const completed = momentIndex(currentMoment) >= momentIndex(moment);
          return <div className={completed ? "completed" : ""} key={moment}><i>{completed ? "✓" : ""}</i><strong>{leagueMomentLabels[moment]}</strong></div>;
        })}
        {includeSeasonEnd && <div><i></i><strong>{leagueMomentLabels.season_end}</strong></div>}
      </div>
    </section>
  );
}
