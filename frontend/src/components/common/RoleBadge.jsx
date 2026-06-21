const COLORS = {
  viewer: { bg: 'var(--surface-2)', text: 'var(--text-muted)' },
  editor: { bg: 'var(--badge-info-bg)', text: 'var(--badge-info-text)' },
  admin:  { bg: 'var(--warning-dim)', text: 'var(--warning)' },
  owner:  { bg: 'var(--badge-error-bg)', text: 'var(--badge-error-text)' },
};

export default function RoleBadge({ role }) {
  const c = COLORS[role] || COLORS.viewer;
  return (
    <span style={{
      display: 'inline-block',
      padding: '1px 8px',
      borderRadius: 'var(--radius-sm)',
      fontSize: 11,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
      background: c.bg,
      color: c.text,
    }}>
      {role}
    </span>
  );
}
