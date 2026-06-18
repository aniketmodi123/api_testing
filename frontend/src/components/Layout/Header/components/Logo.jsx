import { Link } from 'react-router-dom';
import styles from './HeaderComponents.module.css';

const Logo = () => {
  return (
    <Link to="/collections" className={styles.logo}>
      <div className={styles.logoIcon}>A</div>
      <h1 className={styles.logoText}>ApiPilot</h1>
    </Link>
  );
};

export default Logo;
