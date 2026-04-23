import styles from '../catalog/placeholder.module.css';

export default function ReportsPage() {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>📈 Rapportgenerator</h1>
        <p className={styles.subtitle}>Generera Power BI-rapporter med DAX, dbt SQL och TMDL från naturliga beskrivningar.</p>
      </div>
      <div className={styles.comingSoon}>
        <div className={styles.icon}>📊</div>
        <h2>Under utveckling</h2>
        <p>PBI-rapportgeneratorn migreras från DataLens. AI-driven DAX, dbt SQL och TMDL-generering kommer snart.</p>
      </div>
    </div>
  );
}
