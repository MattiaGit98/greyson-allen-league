"use client";

import { useEffect, useRef, useState } from "react";

export type MovementListItem = {
  id: string;
  dateTime: string;
  displayedDate: string;
  operation: string;
  conciseDetail: string;
  fullDetail: string;
};

export function MovementList({ movements, historyDays, emptyMessage }: { movements: MovementListItem[]; historyDays: number; emptyMessage?: string }) {
  const [selected, setSelected] = useState<MovementListItem | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!selected || !dialog) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [selected]);

  return (
    <>
      <div className="movement-list">
        <div className="movement-list-head"><span>Data e ora</span><span>Operazione</span><span>Dettaglio</span></div>
        {movements.map((movement) => (
          <button className="movement-list-row" type="button" key={movement.id} onClick={() => setSelected(movement)} aria-haspopup="dialog">
            <time dateTime={movement.dateTime}>{movement.displayedDate}</time>
            <strong>{movement.operation}</strong>
            <span className="movement-detail">{movement.conciseDetail}</span>
          </button>
        ))}
        {!movements.length && <div className="movement-empty">{emptyMessage ?? `Nessun movimento registrato negli ultimi ${historyDays} giorni`}</div>}
      </div>

      {selected && (
        <dialog className="movement-detail-dialog" ref={dialogRef} aria-labelledby="movement-detail-title" aria-describedby="movement-detail-text" onClose={() => setSelected(null)} onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}>
          <div className="movement-detail-dialog-content">
            <header>
              <span>Movimento del <time dateTime={selected.dateTime}>{selected.displayedDate}</time></span>
              <h2 id="movement-detail-title">{selected.operation}</h2>
            </header>
            <p id="movement-detail-text">{selected.fullDetail}</p>
            <footer><button className="button secondary" type="button" onClick={() => setSelected(null)}>Chiudi</button></footer>
          </div>
        </dialog>
      )}
    </>
  );
}
