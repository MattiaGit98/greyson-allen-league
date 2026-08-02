"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const publicLinks = [
  ["Squadre", "/squadre"],
  ["Giocatori", "/giocatori"],
  ["Movimenti", "/movimenti"],
  ["Calendario", "/calendario"],
  ["Classifiche e tabelloni", "/competizioni"],
  ["Storico", "/storico"],
  ["Regolamento", "/regolamento"],
  ["Asta live", "/asta"],
];

const adminLinks = [
  ["Dashboard", "/admin"],
  ["Firma free agent", "/admin/free-agent"],
  ["Scambi", "/admin/scambi"],
  ["Team option", "/admin/team-option"],
  ["Assegnazione contratti", "/admin/contratti"],
  ["Spostamento slot", "/admin/slot"],
  ["Altre operazioni", "/admin/altre-operazioni"],
  ["Squadre e proprietari", "/admin/squadre-proprietari"],
  ["Annulla movimenti", "/admin/movimenti"],
  ["Calendario", "/admin/calendario"],
  ["Listone", "/admin/listone"],
  ["Classifiche e tabelloni", "/admin/contenuti"],
  ["Storico", "/admin/storico"],
  ["Backup", "/admin/backup"],
  ["Importa dati", "/admin/importa-dati"],
  ["Avanzamento della lega", "/admin/impostazioni"],
  ["Pannello asta", "/admin/asta"],
  ["Posizioni draft", "/admin/posizioni-draft"],
  ["Pannello draft", "/admin/draft"],
];

function isCurrent(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname.startsWith(href);
}

export function SiteNavigation({ seasonName, phaseName, phase, auctionOpen }: { seasonName: string; phaseName: string; phase: string; auctionOpen: boolean }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");
  const isLogin = pathname.startsWith("/login");
  const links = isAdmin ? adminLinks : publicLinks.filter(([, href]) => href !== "/asta" || auctionOpen);
  const currentAdminLabel = adminLinks.find(([, href]) => isCurrent(pathname, href))?.[0] ?? "Amministrazione";

  return (
    <>
      <header className="site-header">
        <Link className="brand" href="/squadre" aria-label="Greyson Allen League, squadre">
          <span className="brand-copy">
            <strong>Greyson Allen League</strong>
            <small>{seasonName} · {phaseName}</small>
          </span>
        </Link>
        <nav className="area-switcher" aria-label="Selezione area">
          <Link className={!isAdmin && !isLogin ? "active" : ""} href="/squadre">Area lega</Link>
          <Link className={isAdmin ? "active" : ""} href="/admin">Amministrazione</Link>
        </nav>
      </header>
      {!isLogin && !isAdmin && (
        <nav className="section-nav" aria-label="Navigazione area lega">
          {links.map(([label, href]) => (
            <Link className={isCurrent(pathname, href) ? "active" : ""} href={href} key={href}>{label}</Link>
          ))}
        </nav>
      )}
      {!isLogin && isAdmin && pathname !== "/admin" && (
        <nav className="section-nav admin dashboard-return" aria-label="Ritorno alla dashboard">
          <Link href="/admin">← Torna alla dashboard</Link>
          <span>{currentAdminLabel}</span>
        </nav>
      )}
    </>
  );
}
