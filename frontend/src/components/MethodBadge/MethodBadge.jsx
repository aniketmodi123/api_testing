import styles from './MethodBadge.module.css';

const KNOWN_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

export default function MethodBadge({ method = 'GET', size = 'md', className = '' }) {
  const m = method.toUpperCase();
  const methodClass = KNOWN_METHODS.has(m) ? styles[m] : styles.DEFAULT;
  return (
    <span className={`${styles.badge} ${styles[size]} ${methodClass} ${className}`}>
      {m}
    </span>
  );
}
