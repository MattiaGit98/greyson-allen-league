"use client";

import { useEffect, useRef, useState } from "react";

export type HomeMovementItem = {
  id: string;
  dateTime: string;
  displayedDate: string;
  operation: string;
  conciseDetail: string;
  fullDetail: string;
};

export function HomeMovementList({ movements }: { movements: HomeMovementItem[] }) {
  const [selected, setSelected] = useState<HomeMovementItem | null>(null);
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
      <div className="home-movement-list">
        {movements.map((movement) => (
          <button
            className="home-movement"
            type="button"
            key={movement.id}
            onClick={() => setSelected(movement)}
            aria-haspopup="dialog"
          >
            <time dateTime={movement.dateTime}>{movement.displayedDate}</time>
            <div><strong>{movement.operation}</strong><span>{movement.conciseDetail}</span></div>
          </button>
        ))}
      </div>

      {selected && (
        <dialog
          className="movement-detail-dialog"
          ref={dialogRef}
          aria-labelledby="home-movement-detail-title"
          aria-describedby="home-movement-detail-text"
          onClose={() => setSelected(null)}
          onClick={(event) => {
            if (event.target === event.currentTarget) event.currentTarget.close();
          }}
        >
          <div className="movement-detail-dialog-content">
            <header>
              <span>Movimento del <time dateTime={selected.dateTime}>{selected.displayedDate}</time></span>
              <h2 id="home-movement-detail-title">{selected.operation}</h2>
            </header>
            <p id="home-movement-detail-text">{selected.fullDetail}</p>
            <footer><button className="button secondary" type="button" onClick={() => setSelected(null)}>Chiudi</button></footer>
          </div>
        </dialog>
      )}
    </>
  );
}
