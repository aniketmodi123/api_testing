import styles from './MethodBadge.module.css';

const METHOD_COLORS = {
  GET:     { bg: '#10b981', color: '#fff' },
  POST:    { bg: '#3b82f6', color: '#fff' },
  PUT:     { bg: '#f59e0b', color: '#000' },
  PATCH:   { bg: '#8b5cf6', color: '#fff' },
  DELETE:  { bg: '#ef4444', color: '#fff' },
  HEAD:    { bg: '#6b7280', color: '#fff' },
  OPTIONS: { bg: '#6b7280', color: '#fff' },
};

export default function MethodBadge({ method = 'GET', size = 'md', className = '' }) {
  const m = method.toUpperCase();
  const { bg, color } = METHOD_COLORS[m] || { bg: '#6b7280', color: '#fff' };
  return (
    <span
      className={`${styles.badge} ${styles[size]} ${className}`}
      style={{ backgroundColor: bg, color }}
    >
      {m}
    </span>
  );
}
