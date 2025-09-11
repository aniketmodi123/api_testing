import { useState } from 'react';
import ConfirmModal from './components/ConfirmModal/ConfirmModal';
import { Button } from './components/common';

export default function ConfirmModalPreview() {
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{
        minHeight: 400,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#18181b',
      }}
    >
      <Button variant="primary" onClick={() => setOpen(true)}>
        Show ConfirmModal
      </Button>

      <ConfirmModal
        isOpen={open}
        title="Delete Environment"
        message="Are you sure you want to delete the environment?"
        warn_message="This action cannot be undone. All variables in this environment will be permanently deleted."
        confirmText="Delete Environment"
        cancelText="Cancel"
        type="delete"
        onConfirm={() => setOpen(false)}
        onCancel={() => setOpen(false)}
      />
    </div>
  );
}
