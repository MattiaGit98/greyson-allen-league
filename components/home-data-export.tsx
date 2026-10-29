export function HomeDataExport() {
  return (
    <section className="home-data-export" aria-labelledby="home-data-export-title">
      <h2 id="home-data-export-title">Esporta dati della lega</h2>
      <p>Scarica i dati aggiornati della lega per analisi offline o utilizzo con strumenti esterni.</p>
      <a className="button secondary" href="/esporta-dati" download="greyson-allen-league-data.json">Scarica dati</a>
    </section>
  );
}
