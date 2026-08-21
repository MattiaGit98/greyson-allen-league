"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function LivePageRefresh() {
  const pathname = usePathname();
  const router = useRouter();
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAdmin = pathname.startsWith("/admin");
  const preserveForm = isAdmin || pathname === "/simulatore-scambi";

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const formForEvent = (event: Event) => event.target instanceof Element ? event.target.closest("form") : null;
    const markFormDirty = (event: Event) => {
      const form = formForEvent(event);
      if (!form) return;
      form.dataset.liveDirty = "true";
      delete form.dataset.liveSubmitting;
      form.removeAttribute("aria-busy");
    };
    const guardSubmittingForm = (event: Event) => {
      const form = formForEvent(event);
      if (!form) return;
      if (form.dataset.liveSubmitting === "true") {
        event.preventDefault();
        return;
      }
      form.dataset.liveSubmitting = "true";
      form.setAttribute("aria-busy", "true");
      (document.activeElement instanceof HTMLElement ? document.activeElement : null)?.blur();
    };
    const preventInputWhileSubmitting = (event: KeyboardEvent) => {
      const form = formForEvent(event);
      if (form?.dataset.liveSubmitting === "true") event.preventDefault();
    };
    const refresh = () => {
      if (preserveForm) {
        const submittingForm = document.querySelector("form[data-live-submitting='true']");
        const dirtyForm = document.querySelector("form[data-live-dirty='true']");
        if (isAdmin && (submittingForm || !dirtyForm)) {
          window.location.reload();
          return;
        }
        setUpdateAvailable(true);
        return;
      }
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => router.refresh(), 350);
    };
    document.addEventListener("input", markFormDirty, true);
    document.addEventListener("change", markFormDirty, true);
    document.addEventListener("submit", guardSubmittingForm, true);
    document.addEventListener("keydown", preventInputWhileSubmitting, true);
    const channel = supabase
      .channel("league-live-refresh")
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "league_live_revision",
        filter: "id=eq.1",
      }, refresh)
      .subscribe();

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      document.removeEventListener("input", markFormDirty, true);
      document.removeEventListener("change", markFormDirty, true);
      document.removeEventListener("submit", guardSubmittingForm, true);
      document.removeEventListener("keydown", preventInputWhileSubmitting, true);
      void supabase.removeChannel(channel);
    };
  }, [isAdmin, preserveForm, router]);

  if (!updateAvailable) return null;
  return (
    <aside className="live-update-notice" role="status">
      <span>I dati della lega sono stati aggiornati.</span>
      <button type="button" onClick={() => { setUpdateAvailable(false); isAdmin ? window.location.reload() : router.refresh(); }}>Aggiorna pagina</button>
    </aside>
  );
}
