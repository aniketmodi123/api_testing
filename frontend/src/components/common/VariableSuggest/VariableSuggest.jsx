import styles from './VariableSuggest.module.css';

// What this file does: renders the {{variable}} autocomplete dropdown anchored
// under a text field, showing each suggestion's key, source (local/global), and value.

export default function VariableSuggest({ open, items, activeIndex, onHover, onPick }) {
  if (!open || !items.length) return null;
  return (
    <ul className={styles.dropdown} role="listbox">
      {items.map((item, idx) => (
        <li
          key={`${item.source}:${item.key}`}
          role="option"
          aria-selected={idx === activeIndex}
          className={`${styles.item} ${idx === activeIndex ? styles.active : ''}`}
          onMouseDown={e => {
            // mousedown (not click) so the field doesn't blur before we insert
            e.preventDefault();
            onPick(item);
          }}
          onMouseEnter={() => onHover(idx)}
        >
          <span className={styles.key}>{item.key}</span>
          <span className={`${styles.badge} ${item.source === 'global' ? styles.global : styles.local}`}>
            {item.source}
          </span>
          <span className={styles.value}>
            {item.is_secret ? '••••••' : item.value || ''}
          </span>
        </li>
      ))}
    </ul>
  );
}
