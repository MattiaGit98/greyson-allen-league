"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const publicLinks = [
  ["Panoramica", "/"],
  ["Squadre", "/squadre"],
  ["Giocatori", "/giocatori"],
  ["Movimenti", "/movimenti"],
  ["Asta live", "/asta"],
];

const adminLinks = [
  ["Dashboard", "/admin"],
  ["Operazioni", "/admin/operazioni"],
  ["Qualifying offer", "/admin/qualifying-offer"],
  ["Fase della lega", "/admin/impostazioni"],
];

function isCurrent(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/admin") return pathname === "/admin";
  return pathname.startsWith(href);
}

export function SiteNavigation() {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");
  const isLogin = pathname.startsWith("/login");
  const links = isAdmin ? adminLinks : publicLinks;

  return (
    <>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Greyson Allen League, home">
          <span className="brand-mark">GAL</span>
          <span>Greyson Allen League</span>
        </Link>
        <nav className="area-switcher" aria-label="Selezione area">
          <Link className={!isAdmin && !isLogin ? "active" : ""} href="/">Area lega</Link>
          <Link className={isAdmin ? "active" : ""} href="/admin">Amministrazione</Link>
        </nav>
      </header>
      {!isLogin && (
        <nav className={`section-nav ${isAdmin ? "admin" : ""}`} aria-label={isAdmin ? "Navigazione amministrazione" : "Navigazione area lega"}>
          {links.map(([label, href]) => (
            <Link className={isCurrent(pathname, href) ? "active" : ""} href={href} key={href}>{label}</Link>
          ))}
        </nav>
      )}
    </>
  );
}
