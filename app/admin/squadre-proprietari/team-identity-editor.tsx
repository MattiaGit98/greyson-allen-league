"use client";

import { useActionState, useEffect, useState } from "react";
import type { TeamSummary } from "@/lib/league-types";
import { saveTeamIdentity, type LeagueEditorSaveState } from "@/app/admin/rettifiche/actions";

const initialState: LeagueEditorSaveState = {};

export function TeamIdentityEditor({ teams }: { teams: TeamSummary[] }) {
  const [selectedCode, setSelectedCode] = useState(teams[0]?.code ?? "");
  const team = teams.find((item) => item.code === selectedCode) ?? teams[0];
  useEffect(() => {
    if (!teams.some((item) => item.code === selectedCode)) setSelectedCode(teams[0]?.code ?? "");
  }, [selectedCode, teams]);

  return (
    <div className="team-identity-editor">
      <label className="roster-editor-team-select">
        <span>Squadra</span>
        <select value={selectedCode} onChange={(event) => setSelectedCode(event.target.value)}>
          {teams.map((item) => <option value={item.code} key={item.code}>{formatTeamName(item.name)}</option>)}
        </select>
      </label>
      {team && <IdentityForm team={team} key={team.code} />}
    </div>
  );
}

function IdentityForm({ team }: { team: TeamSummary }) {
  const [code, setCode] = useState(team.code);
  const [name, setName] = useState(team.name);
  const [owner, setOwner] = useState(team.owner);
  const [state, action, pending] = useActionState(saveTeamIdentity, initialState);

  return (
    <form action={action} className="team-identity-card">
      <input type="hidden" name="original_code" value={team.code} />
      <label><span>Sigla</span><input name="code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} maxLength={5} /></label>
      <label><span>Nome squadra</span><input name="name" value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label><span>Proprietari</span><input name="owner" value={owner} onChange={(event) => setOwner(event.target.value)} /></label>
      <div className="team-identity-preview">
        <b>{code || "—"}</b>
        <strong>{name || "—"}</strong>
        <span>{owner || "—"}</span>
      </div>
      {state.error && <p className="notice error">{state.error}</p>}
      {state.message && <p className="notice success">{state.message}</p>}
      <button className="button primary" type="submit" disabled={pending}>{pending ? "Salvataggio…" : "Salva squadra"}</button>
    </form>
  );
}

function formatTeamName(name: string) {
  return name.toLocaleLowerCase("it-IT").replace(/(^|[\s'-])\p{L}/gu, (letter) => letter.toLocaleUpperCase("it-IT"));
}
