"use client";

import { useActionState, useState } from "react";
import { savePublicNotice, type PublicNoticeSaveState } from "./actions";

const initialState: PublicNoticeSaveState = {};

export function PublicNoticeEditor({ initialNotice }: { initialNotice: string }) {
  const [notice, setNotice] = useState(initialNotice);
  const [state, action, pending] = useActionState(savePublicNotice, initialState);

  return (
    <details className="public-notice-editor" open>
      <summary>Avvisi</summary>
      <form action={action}>
        <label>
          <span>Testo visualizzato nella home</span>
          <textarea name="public_notice" value={notice} onChange={(event) => setNotice(event.target.value)} maxLength={2000} placeholder="Scrivi un avviso per la lega…" />
        </label>
        <div className="public-notice-editor-actions">
          <small>{notice.length}/2000</small>
          {state.error && <p className="notice error">{state.error}</p>}
          {state.message && <p className="notice success">{state.message}</p>}
          <button className="button" type="submit" name="clear_notice" value="true" disabled={pending || !notice}>Svuota avviso</button>
          <button className="button primary" type="submit" disabled={pending}>{pending ? "Salvataggio…" : "Salva avviso"}</button>
        </div>
      </form>
    </details>
  );
}
