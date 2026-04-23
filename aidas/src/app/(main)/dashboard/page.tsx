import styles from './dashboard.module.css';

export default function DashboardPage() {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Översikt</h1>
        <p className={styles.subtitle}>Välkommen till AIDAS — din AI-drivna dataanalysplattform</p>
      </div>

      <div className={styles.grid}>
        <a href="/catalog" className={styles.card}>
          <div className={styles.cardIcon}>🗂️</div>
          <h2>Datakatalog</h2>
          <p>Importera DDL, analysera kolumner och utforska din datakatalog med AI-stöd.</p>
          <span className={styles.cardAction}>Öppna →</span>
        </a>

        <a href="/modeling" className={styles.card}>
          <div className={styles.cardIcon}>🔷</div>
          <h2>Data Vault</h2>
          <p>Modellera Hubs, Links och Satellites interaktivt. Generera SQL automatiskt.</p>
          <span className={styles.cardAction}>Öppna →</span>
        </a>

        <a href="/reports" className={styles.card}>
          <div className={styles.cardIcon}>📈</div>
          <h2>Rapporter</h2>
          <p>Generera Power BI-rapporter med DAX, dbt SQL och TMDL från beskrivningar.</p>
          <span className={styles.cardAction}>Öppna →</span>
        </a>

        <a href="/admin" className={styles.card}>
          <div className={styles.cardIcon}>⚙️</div>
          <h2>Admin</h2>
          <p>Kanban-tavla för ärendehantering och AI-agent för autonom utveckling.</p>
          <span className={styles.cardAction}>Öppna →</span>
        </a>
      </div>

      <div className={styles.statsRow}>
        <div className={styles.stat}>
          <div className={styles.statValue}>—</div>
          <div className={styles.statLabel}>Modeller</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>—</div>
          <div className={styles.statLabel}>Ärenden</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>—</div>
          <div className={styles.statLabel}>Rapporter</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>—</div>
          <div className={styles.statLabel}>Agent Tasks</div>
        </div>
      </div>
    </div>
  );
}
