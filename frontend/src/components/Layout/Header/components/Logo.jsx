import { Link } from 'react-router-dom';

const Logo = () => {
  const styles = {
    logoLink: {
      textDecoration: 'none',
      color: 'inherit',
    },
    logo: {
      fontWeight: 700,
      fontSize: '1.2rem',
      color: 'var(--text-color)',
      margin: 0,
      whiteSpace: 'nowrap',
      flexShrink: 0,
      cursor: 'pointer',
      transition: 'opacity 0.2s ease',
    },
    logoHover: {
      opacity: '0.8',
    },
  };

  return (
    <Link to="/" style={styles.logoLink}>
      <h1
        style={styles.logo}
        onMouseEnter={e => (e.target.style.opacity = '0.8')}
        onMouseLeave={e => (e.target.style.opacity = '1')}
      >
        API Testing
      </h1>
    </Link>
  );
};

export default Logo;
