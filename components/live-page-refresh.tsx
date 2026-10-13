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
    setUpdateAvailable(false);
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const submissions = new Map<HTMLFormElement, { button: HTMLButtonElement | null; sawPending: boolean; timeout: ReturnType<typeof setTimeout> }>();
    let lastSubmittedForm: HTMLFormElement | null = null;
    const formForEvent = (event: Event) => event.target instanceof Element ? event.target.closest("form") : null;
    const finishSubmission = (form: HTMLFormElement) => {
      const submission = submissions.get(form);
      if (!submission) return;
      clearTimeout(submission.timeout);
      submissions.delete(form);
      delete form.dataset.liveSubmitting;
      delete form.dataset.liveSawPending;
      form.removeAttribute("aria-busy");
      form.querySelectorAll("[data-live-outdated]").forEach((notice) => { notice.removeAttribute("data-live-outdated"); });
      if (form.querySelector(".notice.success:not([data-live-outdated])")) {
        delete form.dataset.liveDirty;
        setUpdateAvailable(false);
      }
    };
    const markFormDirty = (event: Event) => {
      const form = formForEvent(event);
      if (!form) return;
      form.dataset.liveDirty = "true";
    };
    const markButtonEdit = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest("button[type='button']")) markFormDirty(event);
    };
    const guardSubmittingForm = (event: Event) => {
      const form = formForEvent(event);
      if (!form) return;
      if (form.dataset.liveSubmitting === "true") {
        event.preventDefault();
        return;
      }
      const notices = isAdmin
        ? document.querySelectorAll("main .notice.success, main .notice.error")
        : form.querySelectorAll(".notice.success, .notice.error");
      notices.forEach((notice) => { notice.setAttribute("data-live-outdated", "true"); });
      form.dataset.liveSubmitting = "true";
      form.setAttribute("aria-busy", "true");
      lastSubmittedForm = form;
      const button = event instanceof SubmitEvent && event.submitter instanceof HTMLButtonElement ? event.submitter : null;
      submissions.set(form, {
        button,
        sawPending: false,
        timeout: setTimeout(() => finishSubmission(form), 30_000),
      });
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
        const openOperation = isAdmin && document.querySelector("[role='dialog'], [role='alertdialog']");
        if (submittingForm) return;
        if (dirtyForm || openOperation) {
          setUpdateAvailable(true);
          return;
        }
        if (isAdmin) {
          if (refreshTimer.current) clearTimeout(refreshTimer.current);
          refreshTimer.current = setTimeout(() => {
            if (document.querySelector("form[data-live-submitting='true']")) return;
            if (document.querySelector("form[data-live-dirty='true'], [role='dialog'], [role='alertdialog']")) {
              setUpdateAvailable(true);
              return;
            }
            router.refresh();
          }, 350);
        } else setUpdateAvailable(true);
        return;
      }
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => router.refresh(), 350);
    };
    document.addEventListener("input", markFormDirty, true);
    document.addEventListener("change", markFormDirty, true);
    document.addEventListener("click", markButtonEdit, true);
    document.addEventListener("submit", guardSubmittingForm, true);
    document.addEventListener("keydown", preventInputWhileSubmitting, true);
    const clearUpdateNotice = () => {
      // Il messaggio di successo può trovarsi fuori dal form (per esempio dopo un redirect).
      // In quel caso il form salvato non deve restare marcato come modifica non salvata.
      if (lastSubmittedForm) delete lastSubmittedForm.dataset.liveDirty;
      lastSubmittedForm = null;
      setUpdateAvailable(false);
    };
    window.addEventListener("admin-action-confirmed", clearUpdateNotice);
    const submissionObserver = new MutationObserver(() => {
      for (const [form, submission] of submissions) {
        if (!form.isConnected) {
          clearTimeout(submission.timeout);
          submissions.delete(form);
          continue;
        }
        if (submission.button?.disabled) submission.sawPending = true;
        if (submission.sawPending && !submission.button?.disabled) finishSubmission(form);
      }
    });
    submissionObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled"] });
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
      document.removeEventListener("click", markButtonEdit, true);
      document.removeEventListener("submit", guardSubmittingForm, true);
      document.removeEventListener("keydown", preventInputWhileSubmitting, true);
      window.removeEventListener("admin-action-confirmed", clearUpdateNotice);
      submissionObserver.disconnect();
      for (const [form, submission] of submissions) {
        clearTimeout(submission.timeout);
        delete form.dataset.liveSubmitting;
        form.removeAttribute("aria-busy");
      }
      void supabase.removeChannel(channel);
    };
  }, [isAdmin, preserveForm, router, pathname]);

  if (!updateAvailable) return null;
  return (
    <aside className="live-update-notice" role="status">
      <span>Sono disponibili dati aggiornati della lega.</span>
      <button type="button" onClick={() => {
        const unfinishedForm = isAdmin && document.querySelector("form[data-live-dirty='true'], [role='dialog'], [role='alertdialog']");
        if (unfinishedForm && !window.confirm("Aggiornare la pagina? Le modifiche non salvate andranno perse.")) return;
        setUpdateAvailable(false);
        if (unfinishedForm) window.location.reload();
        else router.refresh();
      }}>Aggiorna pagina</button>
    </aside>
  );
}
