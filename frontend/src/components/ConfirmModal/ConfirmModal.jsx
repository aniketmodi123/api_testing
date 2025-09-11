import LookingLoader from '../LookingLoader/LookingLoader.jsx';
import styles from './ConfirmModal.module.css';

export default function ConfirmModal({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'delete',
  loading = false,
  loaderText = 'Processing...',
}) {
  if (!isOpen) return null;

  if (loading) {
    return (
      <div className={styles.overlay}>
        <div className={styles.loaderBox}>
          <LookingLoader size={120} text={null} overlay={false} />
          <div className={styles.loaderText}>{loaderText}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.content}>
        <h3 className={styles.title}>{title}</h3>
        <div className={styles.message}>{message}</div>
        <div className={styles.actions}>
          <button className="btn btn-secondary" onClick={onCancel}>
            {cancelText}
          </button>
          <button
            className={`btn btn-${type === 'delete' ? 'danger' : 'primary'}`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
