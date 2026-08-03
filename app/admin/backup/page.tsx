export default function BackupAdminPage() {
  return (
    <section className="section page-top admin-dashboard backup-admin-page">
      <div className="backup-card">
        <div className="backup-card-mark" aria-hidden="true">↓</div>
        <div>
          <strong>Backup e copie</strong>
          <span>Ripristino o consultazione</span>
        </div>
        <div className="backup-actions">
          <a className="button primary backup-download" href="/admin/importa-dati/backup">
            Backup ripristinabile
          </a>
          <a className="button backup-download backup-html-download" href="/admin/backup/visualizzazione">
            Copia statica HTML
          </a>
        </div>
      </div>
    </section>
  );
}
