export type TeamSummary = {
  code: string; name: string; owner: string; credits: number; cost: number; players: number; slug: string;
};

export const teams: TeamSummary[] = [
  ["CSS","COPPEDÈ SUPERSONICS","MATTIA L.",622,374,10],
  ["CSP","COLD SHOWERS PODCASTER","FRANCESCO D. & SV & GMB",165,835,17],
  ["CHA","CHARLOTTE HORNY","GIANFRANCO I.G.",192,806,7],
  ["FAS","FANTANTONIO SPURS","VALERIO L.",477,521,7],
  ["SBB","SAN BASILIO BULLETS","SEBASTIANO P.",382,617,15],
  ["CCH","CINECITTÀ HEAT","DAVIDE B.",365,635,13],
  ["PPL","PRIMA PORTA LERBA","MATTEO I.G. & VALERIO P.",709,291,9],
  ["PSP","PHILADELPHIA SPALMABILE","GABRIELE M. & RICCARDO",34,966,14],
  ["MBF","MEDELLIN BAMBA FARMERS","LUCA T. & FEDERICO",610,390,12],
  ["MMB","MONTE MARIO BOARS","MATTEO R.",816,184,13],
  ["BCT","BIBBIANO CITY THUNDER","FLAVIO C. & PC & LG",668,332,9],
  ["BWE","BOLZANO WEIERSTRASS","ALESSANDRO Q.",613,387,8],
  ["ORF","ORLANDO FURIOSO","FRANCESCO C.",941,58,4],
  ["SDR","SBRONZI DI RIACE","ANDREA C. & GIUSEPPE R.",891,109,6],
].map(([code,name,owner,credits,cost,players]) => ({
  code: String(code), name: String(name), owner: String(owner), credits: Number(credits),
  cost: Number(cost), players: Number(players), slug: String(code).toLowerCase(),
}));
