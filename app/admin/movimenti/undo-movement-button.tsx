"use client";

import { revertMovement } from "./actions";

export function UndoMovementButton({
  movementId,
  summary,
  disabled,
}: {
  movementId: string;
  summary: string;
  disabled: boolean;
}) {
  return (
    <form
      action={revertMovement}
      onSubmit={(event) => {
        if (!window.confirm(`Annullare questo movimento?\n\n${summary}`)) event.preventDefault();
      }}
    >
      <input type="hidden" name="movement_id" value={movementId} />
      <button className="button secondary" type="submit" disabled={disabled}>Annulla movimento</button>
    </form>
  );
}
