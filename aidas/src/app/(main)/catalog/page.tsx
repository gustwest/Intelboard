import styles from './placeholder.module.css';

export default function CatalogPage() {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>🗂️ Datakatalog</h1>
        <p className={styles.subtitle}>Importera DDL, analysera kolumner och utforska din datakatalog med AI-stöd.</p>
      </div>
      <div className={styles.comingSoon}>
        <div className={styles.icon}>🚧</div>
        <h2>Under utveckling</h2>
        <p>DataLens-katalogen migreras till React. DDL-import, kolumnanalys och AI-assisterad dokumentation kommer snart.</p>
      </div>
    </div>
  );
}
