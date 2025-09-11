import './GlobalLoader.css';

export default function GlobalLoader({ size = 32, color = 'var(--primary)' }) {
  return (
    <div className="global-loader" style={{ width: size, height: size }}>
      <div
        className="global-loader-spinner"
        style={{ borderColor: `${color} transparent transparent transparent` }}
      />
    </div>
  );
}
