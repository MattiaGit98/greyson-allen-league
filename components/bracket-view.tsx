export type BracketTeam = { name: string; score: string; homeAdvantage?: boolean };
export type BracketMatch = { teams: BracketTeam[] };
export type BracketStage = { name: string; matches: BracketMatch[] };

export function BracketView({ stages }: { stages: BracketStage[] }) {
  return (
    <div className="bracket-frame">
      <div className="bracket-grid" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(210px, 1fr))` }}>
        {stages.map((stage) => (
          <section className="bracket-stage" key={stage.name}>
            <h2>{stage.name}</h2>
            <div className="bracket-matches">
              {stage.matches.map((match, matchIndex) => (
                <article className="bracket-match" key={`${stage.name}-${matchIndex}`}>
                  {[0, 1].map((teamIndex) => {
                    const team = match.teams[teamIndex];
                    return (
                      <div className={team ? "" : "empty"} key={teamIndex}>
                        <span>
                          {team?.name || "Da definire"}
                          {team?.name && team.homeAdvantage && <sup className="home-advantage">(C)</sup>}
                        </span>
                        {team?.score !== "" && <strong>{team?.score}</strong>}
                      </div>
                    );
                  })}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
