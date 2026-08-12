"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function LivePageRefresh() {
  const pathname = usePathname();
  const router = useRouter();
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preserveForm = pathname.startsWith("/admin") || pathname === "/simulatore-scambi";

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const refresh = () => {
      if (preserveForm) {
        setUpdateAvailable(true);
        return;
      }
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => router.refresh(), 350);
    };
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
      void supabase.removeChannel(channel);
    };
  }, [preserveForm, router]);

  if (!updateAvailable) return null;
  return (
    <aside className="live-update-notice" role="status">
      <span>I dati della lega sono stati aggiornati.</span>
      <button type="button" onClick={() => { setUpdateAvailable(false); router.refresh(); }}>Aggiorna pagina</button>
    </aside>
  );
}
