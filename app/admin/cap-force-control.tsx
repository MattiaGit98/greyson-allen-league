"use client";

export function CapForceControl({
  warnings,
  checked,
  onChange,
}: {
  warnings: string[];
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  if (!warnings.length) return null;

  return (
    <div className="cap-force-control" role="alert">
      <strong>Attenzione: il salary cap non è rispettato</strong>
      {warnings.map((warning) => <p key={warning}>{warning}</p>)}
      <label>
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        <span>Ho verificato i valori e voglio forzare comunque l’operazione</span>
      </label>
    </div>
  );
}
