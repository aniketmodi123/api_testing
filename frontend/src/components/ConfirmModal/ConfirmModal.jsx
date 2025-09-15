import { useEffect } from 'react';
import { Button } from '../common';
import styles from './ConfirmModal.module.css';

export default function ConfirmModal({
  isOpen,
  title = 'Confirm Action',
  message, // can be string OR React node
  warn_message, // can be string OR React node
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'delete',
  onConfirm,
  onCancel,
  loading = false,
  loaderText = 'Processing...',
}) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm && onConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel && onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onConfirm, onCancel]);

  if (!isOpen) return null;
  return (
    <div className={styles.modal}>
      <div className={styles.modalContent}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <h3>{title}</h3>
        </div>

        {/* Body */}
        <div className={styles.modalBody}>
          {message &&
            (typeof message === 'string' ? <p>{message}</p> : message)}
          {warn_message &&
            (typeof warn_message === 'string' ? (
              <p className={styles.warning}>{warn_message}</p>
            ) : (
              <div className={styles.warning}>{warn_message}</div>
            ))}
        </div>

        {/* Footer */}
        <div className={styles.modalFooter}>
          <Button variant="secondary" onClick={onCancel}>
            {cancelText}
          </Button>
          <Button
            variant={type === 'delete' ? 'danger' : 'primary'}
            onClick={onConfirm}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}
