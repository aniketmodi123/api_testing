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
      <div className={styles['confirm-modal-overlay']}>
        <div className={styles['confirm-modal-loader-box']}>
          <LookingLoader size={120} text={null} overlay={false} />
          <div className={styles['confirm-modal-loader-text']}>
            {loaderText}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles['confirm-modal-overlay']}>
      <div className={styles['confirm-modal-content']}>
        <h3 className={styles['confirm-modal-title']}>{title}</h3>
        <div className={styles['confirm-modal-message']}>{message}</div>
        <div className={styles['confirm-modal-actions']}>
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
