/**
 * Mini SVG line chart of last N execution durations.
 * No external library needed.
 *
 * Props:
 *   executions  – BulkTestExecution[]  (most recent first)
 *   width       – number (default 80)
 *   height      – number (default 24)
 */
export default function LatencySparkline({ executions = [], width = 80, height = 24 }) {
  const data = [...executions]
    .reverse()          // oldest first
    .slice(-10)         // last 10
    .map(e => e.duration_ms || 0);

  if (data.length < 2) {
    return <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>—</span>;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * w;
    const y = pad + h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(' ');

  const lastDuration = data[data.length - 1];

  return (
    <span title={`Last 10 executions (ms). Latest: ${lastDuration}ms`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <svg width={width} height={height} style={{ overflow: 'visible' }}>
        <polyline
          points={points}
          fill="none"
          stroke="var(--accent, var(--text-muted))"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Latest point dot */}
        {data.length > 0 && (() => {
          const last = points.split(' ').pop();
          const [cx, cy] = last.split(',').map(Number);
          return <circle cx={cx} cy={cy} r={2.5} fill="var(--accent, var(--text-muted))" />;
        })()}
      </svg>
      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{lastDuration}ms</span>
    </span>
  );
}
