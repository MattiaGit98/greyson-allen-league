"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const publicLinks = [
  ["Home", "/"],
  ["Squadre", "/squadre"],
  ["Giocatori", "/giocatori"],
  ["Movimenti", "/movimenti"],
  ["Calendario", "/calendario"],
  ["Classifiche e tabelloni", "/competizioni"],
  ["Simulatore scambi", "/simulatore-scambi"],
  ["Storico", "/storico"],
  ["Regolamento", "/regolamento"],
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
  ["Pannello draft", "/admin/draft"],
  ["Posizioni draft", "/admin/posizioni-draft"],
];

function isCurrent(pathname: string, href: string) {
  if (href === "/" || href === "/admin") return pathname === href;
  return pathname.startsWith(href);
}

export function SiteNavigation({ seasonName, phaseName }: { seasonName: string; phaseName: string }) {
  const pathname = usePathname();
  const [publicMenuOpen, setPublicMenuOpen] = useState(false);
  const initializedPublicMenu = useRef(false);
  const isAdmin = pathname.startsWith("/admin");
  const isLogin = pathname.startsWith("/login");
  const links = isAdmin ? adminLinks : publicLinks;
  const currentAdminLabel = adminLinks.find(([, href]) => isCurrent(pathname, href))?.[0] ?? "Amministrazione";

  useEffect(() => {
    if (window.matchMedia("(max-width: 850px)").matches) {
      setPublicMenuOpen(false);
      return;
    }
    if (!isAdmin && !isLogin && !initializedPublicMenu.current) {
      initializedPublicMenu.current = true;
      setPublicMenuOpen(true);
    }
  }, [isAdmin, isLogin, pathname]);

  function openLeagueHomeOnDesktop() {
    if (!window.matchMedia("(max-width: 850px)").matches) setPublicMenuOpen(true);
  }

  return (
    <>
      <header className="site-header">
        <div className="site-header-start">
          {!isLogin && !isAdmin && (
            <button
              className="public-menu-toggle"
              type="button"
              aria-label={publicMenuOpen ? "Chiudi menu" : "Apri menu"}
              aria-expanded={publicMenuOpen}
              aria-controls="public-navigation"
              onClick={() => setPublicMenuOpen((open) => !open)}
            >
              <span />
              <span />
              <span />
            </button>
          )}
          <Link className="brand" href="/" aria-label="Greyson Allen League, home" onClick={openLeagueHomeOnDesktop}>
          <span className="brand-copy">
            <strong>Greyson Allen League</strong>
            <small>{seasonName} · {phaseName}</small>
          </span>
        </Link>
        </div>
        <Link className="admin-shortcut" href="/admin" aria-label="Apri amministrazione" title="Amministrazione">⚙</Link>
      </header>
      {!isLogin && !isAdmin && (
        <>
          <button
            type="button"
            className={`public-navigation-backdrop${publicMenuOpen ? " is-open" : ""}`}
            aria-label="Chiudi menu"
            tabIndex={publicMenuOpen ? 0 : -1}
            onClick={() => setPublicMenuOpen(false)}
          />
          <nav id="public-navigation" className={`public-navigation${publicMenuOpen ? " is-open" : ""}`} aria-label="Navigazione area lega">
            <header>
              <strong>Menu</strong>
              <button type="button" aria-label="Chiudi menu" onClick={() => setPublicMenuOpen(false)}>×</button>
            </header>
            {links.map(([label, href]) => (
              <Link className={isCurrent(pathname, href) ? "active" : ""} href={href} key={href}>{label}</Link>
            ))}
          </nav>
        </>
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
