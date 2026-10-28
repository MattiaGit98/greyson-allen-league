type TradeTeamDetail = {
  outgoing: string[];
  incoming: string[];
  operations: string[];
  clauses: string[];
};

/** Reconstructs a readable recap from the movement text, without consulting today's roster. */
export function tradeMovementPresentation(summary: string): { concise: string; full: string } | null {
  const match = summary.match(/^(?:Scambio|Sign and trade) ([A-Z0-9_-]+(?:\s*↔\s*[A-Z0-9_-]+)+):\s*([\s\S]*)$/i);
  if (!match) return null;

  const codes = match[1].split(/\s*↔\s*/);
  const teams = new Map(codes.map((code) => [code, { outgoing: [], incoming: [], operations: [], clauses: [] } as TradeTeamDetail]));
  const listed: string[] = [];
  const shared: string[] = [];
  const sharedClauses: string[] = [];
  const parts = match[2].split(/;\s*/).map((part) => part.trim()).filter(Boolean);

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const transfer = part.match(/^(.*?):\s*([A-Z0-9_-]+)\s*→\s*([A-Z0-9_-]+)$/i);
    if (transfer && !/^Diritti Q\.O\. su /i.test(transfer[1]) && teams.has(transfer[2]) && teams.has(transfer[3])) {
      const name = transfer[1];
      const slotChange = /^(Roster|Two-way|G-League|DPE)\s*→\s*(Roster|Two-way|G-League|DPE)$/i.test(parts[index + 1] ?? "")
        ? parts[++index] : null;
      const contract = /^\d+ crediti, contratto /i.test(parts[index + 1] ?? "") ? parts[++index] : null;
      const asset = [name, contract, slotChange].filter(Boolean).join(" · ");
      teams.get(transfer[2])!.outgoing.push(asset);
      teams.get(transfer[3])!.incoming.push(asset);
      listed.push(`${name} (${transfer[3]})`);
      continue;
    }

    const qualifying = part.match(/^Diritti Q\.O\. su (.*?):\s*([A-Z0-9_-]+)\s*→\s*([A-Z0-9_-]+)$/i);
    if (qualifying && teams.has(qualifying[2]) && teams.has(qualifying[3])) {
      const amount = /^importo \d+/i.test(parts[index + 1] ?? "") ? parts[++index] : null;
      const credits = amount?.replace(/^importo /i, "");
      const asset = `Q.O. ${qualifying[1]}${credits ? ` (${credits} ${credits === "1" ? "credito" : "crediti"})` : ""}`;
      teams.get(qualifying[2])!.outgoing.push(asset);
      teams.get(qualifying[3])!.incoming.push(asset);
      listed.push(`Q.O. ${qualifying[1]} (${qualifying[3]})`);
      continue;
    }

    const cut = part.match(/^Taglio contestuale:\s*(.*?)\s*\(([A-Z0-9_-]+)\)$/i);
    if (cut && teams.has(cut[2])) {
      const contract = /^\d+ crediti, contratto /i.test(parts[index + 1] ?? "") ? parts[++index] : null;
      const stretch = /^stretch provision:/i.test(parts[index + 1] ?? "") ? parts[++index] : null;
      teams.get(cut[2])!.operations.push([`Taglio contestuale: ${cut[1]}`, contract, stretch].filter(Boolean).join(" · "));
      listed.push(`taglio ${cut[1]} (${cut[2]})`);
      continue;
    }

    const existingStretch = part.match(/^Stretch su tagliato:\s*(.*?)\s*\(([A-Z0-9_-]+)\)$/i);
    if (existingStretch && teams.has(existingStretch[2])) {
      const contract = /^\d+ crediti, contratto /i.test(parts[index + 1] ?? "") ? parts[++index] : null;
      const installments = /^[23] rate da \d+ crediti, scadenza /i.test(parts[index + 1] ?? "") ? parts[++index] : null;
      teams.get(existingStretch[2])!.operations.push([`Stretch su tagliato: ${existingStretch[1]}`, contract, installments].filter(Boolean).join(" · "));
      listed.push(`stretch ${existingStretch[1]} (${existingStretch[2]})`);
      continue;
    }

    const move = part.match(/^Spostamento contestuale:\s*(.*?)\s*\(([A-Z0-9_-]+)\)$/i);
    if (move && teams.has(move[2])) {
      const slots = /^(Roster|Two-way|G-League|DPE)\s*→\s*(Roster|Two-way|G-League|DPE)$/i.test(parts[index + 1] ?? "")
        ? parts[++index] : null;
      teams.get(move[2])!.operations.push(`Spostamento: ${move[1]}${slots ? `, ${slots}` : ""}`);
      listed.push(`spostamento ${move[1]} (${move[2]})`);
      continue;
    }

    const restoration = part.match(/^Ripristino ruoli richiesto:\s*([A-Z0-9_-]+)$/i);
    if (restoration && teams.has(restoration[1])) {
      const following = /^free agent casuali /i.test(parts[index + 1] ?? "") ? parts[++index] : null;
      teams.get(restoration[1])!.operations.push(`Ripristino ruoli richiesto${following ? `: ${following}` : ""}`);
      listed.push(`ripristino ruoli (${restoration[1]})`);
      continue;
    }

    const removedClause = part.match(/^Clausola eliminata:.*?\(([A-Z0-9_-]+)\) con contropartita .*?\(([A-Z0-9_-]+)\)$/i);
    if (removedClause && teams.has(removedClause[1]) && teams.has(removedClause[2])) {
      teams.get(removedClause[1])!.clauses.push(part);
      if (removedClause[2] !== removedClause[1]) teams.get(removedClause[2])!.clauses.push(part);
      listed.push(`clausola rimossa (${removedClause[1]}, ${removedClause[2]})`);
      continue;
    }

    if (/^Clausola su scelta /i.test(part)) listed.push(part.replace(/^Clausola su scelta /i, "clausola su scelta "));

    if (/^Clausola su scelta |^Clausola (?:eliminata|modificata):/i.test(part)) {
      sharedClauses.push(part);
    } else if (/^contropartita /i.test(part) && sharedClauses.length) {
      sharedClauses[sharedClauses.length - 1] += `; ${part}`;
    } else if (/^a favore di [A-Z0-9_-]+$/i.test(part) && sharedClauses.length) {
      const beneficiary = part.replace(/^a favore di /i, "");
      if (teams.has(beneficiary)) {
        teams.get(beneficiary)!.clauses.push(sharedClauses.pop()!);
        listed[listed.length - 1] += ` (${beneficiary})`;
      } else {
        sharedClauses[sharedClauses.length - 1] += `; ${part}`;
      }
    } else {
      shared.push(part);
    }
  }

  if (!listed.length) return null;
  const detail = codes.flatMap((code) => {
    const team = teams.get(code)!;
    return [
      code,
      `Cede: ${team.outgoing.join("; ") || "—"}`,
      `Riceve: ${team.incoming.join("; ") || "—"}`,
      ...(team.operations.length ? [`Operazioni contestuali: ${team.operations.join("; ")}`] : []),
      ...(team.clauses.length ? [`Clausole: ${team.clauses.join("; ")}`] : []),
    ].join("\n");
  });
  if (sharedClauses.length) detail.push(`Clausole dello scambio: ${sharedClauses.join("; ")}`);
  if (shared.length) detail.push(`Altri dettagli dello scambio: ${shared.join("; ")}`);
  return { concise: `${codes.join(" ↔ ")}: ${listed.join("; ")}`, full: detail.join("\n\n") };
}
