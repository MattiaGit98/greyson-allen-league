import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Greyson Allen League",
  description: "Roster, contratti e movimenti della lega",
};

const links = [
  ["Panoramica", "/"],
  ["Squadre", "/squadre"],
  ["Giocatori", "/giocatori"],
  ["Movimenti", "/movimenti"],
  ["Asta live", "/asta"],
  ["Admin", "/admin"],
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body>
        <header className="site-header">
          <Link className="brand" href="/" aria-label="Greyson Allen League, home">
            <span className="brand-mark">GAL</span>
            <span>Greyson Allen League</span>
          </Link>
          <nav aria-label="Navigazione principale">
            {links.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
