import type {
  DraftAsset,
  QualifyingOfferRight,
  RosterEntry,
  TeamSummary,
} from "@/lib/league-types";
import type {
  HistoryBracketContent,
  HistoryCompetitionMap,
  HistoryEntryContent,
} from "@/lib/history-competitions";
import { calculateCapSpace, followingSeasonName } from "@/lib/season-time";

export type StaticLeagueHtmlInput = {
  exportedAt: Date;
  seasonName: string;
  phaseName: string;
  countTeamOptions: boolean;
  teams: TeamSummary[];
  rosterEntries: RosterEntry[];
  draftAssets: DraftAsset[];
  qualifyingOfferRights: QualifyingOfferRight[];
  history: HistoryCompetitionMap;
};

export function renderStaticLeagueHtml(input: StaticLeagueHtmlInput) {
  const generated = new Intl.DateTimeFormat("it-IT", { dateStyle: "long", timeStyle: "short" }).format(input.exportedAt);
  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Greyson Allen League · ${e(input.seasonName)}</title>
<style>${staticStyles}</style>
</head>
<body>
<header><div><strong>Greyson Allen League</strong><span>${e(input.seasonName)} · ${e(input.phaseName)}</span></div><small>Copia statica · ${e(generated)}</small></header>
<nav>
  <a href="#squadre">Squadre</a><a href="#storico">Storico</a>
</nav>
<main>
  <section id="squadre"><h1>Squadre</h1>${renderTeams(input)}</section>
  <section id="storico"><h1>Storico</h1>${renderHistory(input.history)}</section>
</main>
<footer>Backup statico di sola visualizzazione · Regolamento non incluso</footer>
</body>
</html>`;
}

function renderTeams(input: StaticLeagueHtmlInput) {
  const nextDraftYear = input.draftAssets.length
    ? Math.min(...input.draftAssets.map((asset) => asset.year))
    : null;
  return `<div class="stack">${input.teams.map((team, index) => {
    const entries = input.rosterEntries.filter((entry) => entry.teamCode === team.code);
    const active = entries.filter((entry) => entry.state === "active");
    const regular = active.filter((entry) => entry.slot === "regular").sort((a, b) => b.cost - a.cost);
    const twoWay = active.filter((entry) => entry.slot === "two_way");
    const gLeague = active.filter((entry) => entry.slot === "g_league");
    const dpe = active.filter((entry) => entry.slot === "dpe");
    const cut = entries.filter((entry) => entry.state === "cut");
    const assets = input.draftAssets.filter((asset) => asset.teamCode === team.code).sort(compareDraftAssets);
    const rights = input.qualifyingOfferRights.filter((right) => right.teamCode === team.code);
    const roles = {
      G: active.filter((entry) => entry.slot !== "dpe" && entry.role === "G").length,
      A: active.filter((entry) => entry.slot !== "dpe" && entry.role === "A").length,
      C: active.filter((entry) => entry.slot !== "dpe" && entry.role === "C").length,
    };
    const capSeasons = [input.seasonName, followingSeasonName(input.seasonName), followingSeasonName(input.seasonName, 2)];
    const caps = capSeasons.map((seasonName) => calculateCapSpace({
      entries,
      seasonName,
      optionSeasonName: input.seasonName,
      countTeamOptions: input.countTeamOptions,
    }));
    return `<details class="team" open>
      <summary><i class="badge hue-${index % 7}">${e(team.code)}</i><b>${e(team.name)}</b><span>${e(team.owner)}</span></summary>
      <div class="team-body">
        <div class="cap"><span>Cap libero ${e(capSeasons[0])}</span><strong>${caps[0]}</strong></div>
        <div class="metrics"><div><span>Cap libero ${e(capSeasons[1])}</span><b>${caps[1]}</b></div><div><span>Cap libero ${e(capSeasons[2])}</span><b>${caps[2]}</b></div><div><span>Ruoli</span><b>${roles.G} G / ${roles.A} A / ${roles.C} C</b></div></div>
        ${renderRosterGroup(`Roster (${regular.length}/15)`, regular)}
        ${renderRosterGroup(`Two-way (${twoWay.length}/2)`, twoWay)}
        ${renderRosterGroup(`G-League (${gLeague.length}/3)`, gLeague)}
        ${renderDraftAssets(assets, nextDraftYear)}
        ${renderRosterGroup("Disabled player exception", dpe)}
        ${renderRosterGroup("Tagliati", cut, true)}
        <h3>Qualifying offer</h3>${table(["Giocatore", "Importo"], rights.map((right) => [right.playerName, right.qualifyingAmount]))}
      </div>
    </details>`;
  }).join("")}</div>`;
}

function renderRosterGroup(title: string, entries: RosterEntry[], cutPlayers = false) {
  return `<h3>${e(title)}</h3>${table(["Giocatore", cutPlayers ? "Stretch" : "Ruolo", "Scadenza", "Costo"], entries.map((entry) => [
    entry.name,
    cutPlayers ? (entry.stretchProvisionApplied || entry.buyoutApplied ? "X" : "—") : entry.role ?? "X",
    `${entry.contract || "—"}${entry.auctionAcquisition === "qualifying_offer" ? " · ACQ. Q.O." : entry.auctionAcquisition === "restricted_free_agent" ? " · RFA" : ""}`,
    entry.cost,
  ]))}`;
}

function renderDraftAssets(assets: DraftAsset[], nextDraftYear: number | null) {
  return `<h3>Scelte</h3>${table(["Anno", "Giro", "SQ / POS", "Clausola"], assets.map((asset) => [
    asset.year === nextDraftYear ? `★ ${asset.year}` : asset.year,
    asset.round,
    asset.originOrOverall,
    asset.label || "—",
  ]))}`;
}

function renderHistory(history: HistoryCompetitionMap) {
  return Object.entries(history).map(([name, entries]) => `<details class="content" open><summary>${e(name)}</summary>${entries.length
    ? entries.map((entry) => `<details class="season"><summary>${e(entry.season)}</summary>${renderHistoryEntry(entry.content)}</details>`).join("")
    : `<div class="empty">Nessun dato registrato</div>`}</details>`).join("");
}

function renderHistoryEntry(content: HistoryEntryContent) {
  if (content.kind === "ranking") {
    return table(["Pos.", "Squadra"], content.positions.map((team, index) => [index + 1, team || "—"]));
  }
  if (content.kind === "bracket") return renderHistoryBracket(content);
  if (content.kind === "draft") return table(["Scelta", "Squadra", "Giocatore"], content.rows.map((row) => [row.pick, row.team, row.player]));
  if (content.kind === "winning_roster") return `<h3>${e(content.teamName || "—")}</h3>${table(["Giocatori"], content.players.map((player) => [player || "—"]))}`;
  if (content.kind === "honours") return table(["Stagione", "Squadra", "Proprietari"], content.rows.map((row) => [row.season, row.team, row.owners]));
  return table(["Nome", "Titoli"], content.rows.map((row) => [row.label, row.count]));
}

function renderHistoryBracket(content: HistoryBracketContent) {
  return `<div class="bracket">${content.stages.map((stage) => `<div class="stage"><h3>${e(stage.name)}</h3><div class="matches">${stage.matches.map((match) => `<div class="match">${match.teams.map((team) => `<div><span>${e(team.teamName || "Da definire")}${team.teamName && team.homeAdvantage ? "<sup>(C)</sup>" : ""}</span>${team.score ? `<b>${e(team.score)}</b>` : ""}</div>`).join("")}</div>`).join("")}</div></div>`).join("")}</div>`;
}

function table(headers: string[], rows: Array<Array<string | number>>) {
  const head = headers.length ? `<thead><tr>${headers.map((header) => `<th>${e(header)}</th>`).join("")}</tr></thead>` : "";
  const body = rows.length
    ? rows.map((row) => `<tr>${row.map((cell) => `<td>${e(String(cell))}</td>`).join("")}</tr>`).join("")
    : `<tr><td class="empty-cell" colspan="${Math.max(1, headers.length)}">—</td></tr>`;
  return `<div class="table"><table>${head}<tbody>${body}</tbody></table></div>`;
}

function compareDraftAssets(left: DraftAsset, right: DraftAsset) {
  if (left.year !== right.year) return left.year - right.year;
  const leftRound = Number(left.round.match(/\d+/)?.[0] ?? 99);
  const rightRound = Number(right.round.match(/\d+/)?.[0] ?? 99);
  if (leftRound !== rightRound) return leftRound - rightRound;
  return String(left.originOrOverall).localeCompare(String(right.originOrOverall), "it", { numeric: true });
}

function e(value: string | number) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]!);
}

const staticStyles = `
:root{--green:#183f34;--lime:#c7f36b;--ink:#202722;--muted:#697069;--line:#dedbd2;--paper:#f4f1e9;--card:#fffdf7;--orange:#ff6b35}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);font-family:Arial,Helvetica,sans-serif}header{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:22px 5vw;background:var(--green);color:white}header strong,header span{display:block}header strong{font-size:19px}header span,header small{margin-top:4px;color:#b9c8c1;font-size:11px}nav{position:sticky;top:0;z-index:2;display:flex;gap:5px;overflow:auto;padding:9px 5vw;border-bottom:1px solid var(--line);background:rgba(244,241,233,.96)}nav a{padding:8px 10px;border-radius:99px;color:var(--green);font-size:10px;font-weight:800;text-decoration:none;white-space:nowrap}nav a:hover{background:var(--green);color:var(--lime)}main{width:min(1440px,100%);margin:auto;padding:12px 4vw 70px}main>section{padding-top:45px;scroll-margin-top:54px}h1{margin:0 0 18px;color:var(--green);font-size:25px}.stack{display:grid;gap:8px}details{background:var(--card)}details>summary{cursor:pointer;list-style:none}.team{overflow:hidden;border:1px solid var(--line);border-radius:13px}.team>summary{display:grid;grid-template-columns:42px minmax(0,1fr) minmax(120px,.7fr);align-items:center;gap:11px;padding:10px 13px}.team>summary span{color:var(--muted);font-size:10px}.badge{width:36px;height:36px;display:grid;place-items:center;border-radius:50%;background:var(--green);color:white;font-size:8px;font-style:normal}.hue-1{background:#31517d}.hue-2{background:#a8492d}.hue-3{background:#2f7371}.hue-4{background:#684275}.hue-5{background:#825a24}.hue-6{background:#4f5d31}.team-body{padding:17px;border-top:1px solid var(--line);background:linear-gradient(180deg,#f0f4e6,var(--card) 170px)}.cap{display:flex;justify-content:space-between;gap:20px;padding:16px;border-radius:12px;background:var(--green);color:white}.cap span{font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.cap strong{color:var(--lime);font-size:22px}.metrics{display:grid;grid-template-columns:repeat(3,1fr);margin-top:8px;overflow:hidden;border:1px solid var(--line);border-radius:11px;background:white}.metrics div{padding:12px;border-right:1px solid var(--line);text-align:center}.metrics div:last-child{border:0}.metrics span,.metrics b{display:block}.metrics span{color:var(--muted);font-size:8px;text-transform:uppercase}.metrics b{margin-top:6px;color:var(--green);font-size:12px}h3{margin:22px 0 7px;color:var(--green);font-size:10px;text-transform:uppercase;letter-spacing:.07em}.table{max-width:100%;overflow:auto;border:1px solid var(--line);border-top:2px solid var(--green);border-radius:10px;background:white}table{width:100%;border-collapse:collapse;font-size:10px}th,td{padding:9px 10px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}th{background:#f0f1e9;color:#596158;font-size:8px;text-transform:uppercase;letter-spacing:.07em}tr:last-child td{border-bottom:0}mark{padding:3px 5px;border-radius:5px;background:var(--green);color:var(--lime)}.empty,.empty-cell{padding:35px;color:var(--muted);text-align:center}.content{margin-bottom:9px;overflow:hidden;border:1px solid var(--line);border-radius:13px}.content>summary{padding:14px 16px;background:var(--green);color:var(--lime);font-size:11px;font-weight:900;text-transform:uppercase}.content>.table,.content>.wide,.content>.bracket{margin:12px}.season{margin:10px;border:1px solid var(--line);border-radius:10px}.season>summary{padding:11px 13px;background:#f0f1e9;color:var(--green);font-size:10px;font-weight:900}.season>.table,.season>.bracket{margin:9px}.bracket{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(190px,1fr);gap:11px;overflow:auto}.stage{min-width:190px}.stage>h3{margin:0 0 8px;padding:9px;border-radius:8px;background:var(--green);color:var(--lime);text-align:center}.matches{display:grid;gap:9px}.match{overflow:hidden;border:1px solid var(--line);border-radius:9px;background:white}.match>div{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;min-height:35px;padding:7px 9px;border-bottom:1px solid var(--line)}.match>div:last-child{border:0}.match span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.match b{min-width:23px;padding:5px;border-radius:5px;background:#e8eee9;color:var(--green);text-align:center}.match sup{margin-left:3px;color:var(--orange);font-weight:900}.wide{overflow:auto}.wide table{width:max-content;min-width:100%}footer{padding:25px 5vw;background:var(--green);color:#b9c8c1;font-size:9px;text-align:center}@media(max-width:700px){header{align-items:flex-start;padding:17px 12px}header small{max-width:130px;text-align:right}main{padding-right:0;padding-left:0}main>section>h1{padding:0 9px}.team{border-right:0;border-left:0;border-radius:0}.team>summary{grid-template-columns:40px minmax(0,1fr)}.team>summary span{grid-column:2}.team-body{padding:12px 0}.cap,.metrics,h3{margin-right:7px;margin-left:7px}.metrics{grid-template-columns:1fr}.metrics div{border-right:0;border-bottom:1px solid var(--line)}.table{border-right:0;border-left:0;border-radius:0}.content{border-right:0;border-left:0;border-radius:0}.content>.table,.content>.wide,.content>.bracket{margin-right:0;margin-left:0}.bracket{padding:0 8px}}
`;
