import { useEffect, useRef, useState } from 'react';
import styles from './BulkTestPanel.module.css';

export default function CustomSelect({ options, value, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();

  useEffect(() => {
    function handleClickOutside(event) {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div className={styles.customSelectWrapper} ref={ref}>
      <button
        className={styles.customSelectButton}
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        type="button"
      >
        {selectedOption ? selectedOption.label : 'Select...'}
        <span className={styles.customSelectArrow}>▼</span>
      </button>
      {open && (
        <div className={styles.customSelectDropdown}>
          {options.map(opt => (
            <div
              key={opt.value}
              className={
                styles.customSelectOption +
                (opt.value === value ? ' ' + styles.selected : '')
              }
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
