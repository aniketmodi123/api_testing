import styles from './Home.module.css';

export default function Home() {
  return (
    <div className={styles.homeContainer}>
      <h1 className={styles.title}>Welcome to API Testing Platform</h1>
      <p className={styles.subtitle}>
        Create, organize, and validate your API test cases with advanced
        features.
      </p>
      <div className={styles.infoBox}>
        <h2>Features:</h2>
        <ul>
          <li>Advanced API case validation</li>
          <li>Organize APIs and test cases</li>
          <li>User authentication and workspace management</li>
          <li>Modern, modular React UI</li>
        </ul>
      </div>
    </div>
  );
}
