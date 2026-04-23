import styles from '../catalog/placeholder.module.css';

export default function ModelingPage() {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>🔷 Data Vault Modellering</h1>
        <p className={styles.subtitle}>Interaktiv modellering av Hubs, Links och Satellites med automatisk SQL-generering.</p>
      </div>
      <div className={styles.comingSoon}>
        <div className={styles.icon}>🏗️</div>
        <h2>Under utveckling</h2>
        <p>Data Vault-modelleringsytan konverteras från DataLens prototypen. Hub/Link/Satellite-canvas, drag-and-drop och SQL-export kommer snart.</p>
      </div>
    </div>
  );
}
