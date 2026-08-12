import type { AvailableOperation } from "@/lib/available-operations";

export function AvailableOperations({ operations }: { operations: AvailableOperation[] }) {
  return (
    <aside className="available-operations" aria-label="Operazioni disponibili">
      <header>
        <span>Stato della lega</span>
        <strong>Operazioni disponibili</strong>
      </header>
      <ul>
        {operations.map((operation) => <li className={operation.urgency ? `is-${operation.urgency}` : undefined} key={operation.label}>{operation.label}</li>)}
      </ul>
    </aside>
  );
}
