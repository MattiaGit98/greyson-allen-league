export const pageLoadRecoveryDelay = 1000;
const recoveryCooldown = 120_000;
const storagePrefix = "gal:page-load-recovery:";
const readOnlyPages = new Set(["/", "/squadre", "/giocatori", "/movimenti", "/calendario", "/competizioni", "/storico", "/regolamento"]);

type RecoverySnapshot = {
  href: string;
  pathname: string;
  online: boolean;
  visible: boolean;
  unfinishedWork: boolean;
  documentStartedAt: number;
};

type RecoveryEnvironment = {
  snapshot: () => RecoverySnapshot;
  storage: () => Pick<Storage, "getItem" | "setItem">;
  reload: () => void;
  onRetrying: (retrying: boolean) => void;
};

function canRecover(snapshot: RecoverySnapshot, storage: ReturnType<RecoveryEnvironment["storage"]>) {
  if (!readOnlyPages.has(snapshot.pathname) || !snapshot.online || !snapshot.visible || snapshot.unfinishedWork) return false;
  if (!Number.isFinite(snapshot.documentStartedAt) || snapshot.documentStartedAt <= 0) return false;
  const previous = storage.getItem(`${storagePrefix}${snapshot.pathname}`);
  if (previous === null) return true;
  const attemptedAt = Number(previous);
  if (!Number.isFinite(attemptedAt) || attemptedAt <= 0) return false;
  if (Date.now() - attemptedAt < recoveryCooldown) return false;
  // Anche una risposta molto lenta al reload automatico deve fermarsi al primo errore.
  // Il confronto con l'inizio del documento impedisce loop quando è già passato il cooldown.
  return snapshot.documentStartedAt < attemptedAt || snapshot.documentStartedAt - attemptedAt >= recoveryCooldown;
}

/** Ritenta solo una lettura pubblica. Memorizza esclusivamente l'istante del tentativo, mai dati della lega. */
export function startPageLoadRecovery(environment: RecoveryEnvironment): () => void {
  let initial: RecoverySnapshot;
  try {
    initial = { ...environment.snapshot() };
    if (!canRecover(initial, environment.storage())) {
      environment.onRetrying(false);
      return () => {};
    }
  } catch {
    // Senza un contatore persistente affidabile non si può garantire l'assenza di loop.
    environment.onRetrying(false);
    return () => {};
  }
  environment.onRetrying(true);
  const timer = setTimeout(() => {
    try {
      const current = environment.snapshot();
      const storage = environment.storage();
      if (current.href !== initial.href || !canRecover(current, storage)) {
        environment.onRetrying(false);
        return;
      }
      // Solo il tentativo effettivo consuma il recupero: cleanup e Strict Mode non lo fanno.
      const key = `${storagePrefix}${current.pathname}`;
      const attemptedAt = String(Date.now());
      storage.setItem(key, attemptedAt);
      if (storage.getItem(key) !== attemptedAt) {
        environment.onRetrying(false);
        return;
      }
      environment.reload();
    } catch {
      environment.onRetrying(false);
    }
  }, pageLoadRecoveryDelay);
  return () => clearTimeout(timer);
}

/** Un clic esplicito avvia un nuovo ciclo; il breve ritardo lascia apparire il caricamento. */
export function startManualPageLoadRecovery(environment: {
  pathname: string;
  storage: () => Pick<Storage, "removeItem">;
  reload: () => void;
  onRetrying: (retrying: boolean) => void;
}): () => void {
  environment.onRetrying(true);
  const timer = setTimeout(() => {
    try {
      environment.storage().removeItem(`${storagePrefix}${environment.pathname}`);
    } catch {
      // Lo storage non deve impedire una ricarica richiesta esplicitamente.
    }
    try {
      environment.reload();
    } catch {
      environment.onRetrying(false);
    }
  }, 150);
  return () => clearTimeout(timer);
}
