const COLORS = {
  viewer: { bg: 'var(--p0-surface-2, #e5e7eb)', text: 'var(--text-muted, #6b7280)' },
  editor: { bg: 'rgba(99,102,241,0.15)', text: 'var(--p0-primary, #6366f1)' },
  admin:  { bg: 'rgba(234,179,8,0.15)',  text: '#b45309' },
  owner:  { bg: 'rgba(239,68,68,0.12)',  text: '#b91c1c' },
};

export default function RoleBadge({ role }) {
  const c = COLORS[role] || COLORS.viewer;
  return (
    <span style={{
      display: 'inline-block',
      padding: '1px 8px',
      borderRadius: 4,
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
