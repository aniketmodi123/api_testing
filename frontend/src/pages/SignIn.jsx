import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/session.jsx';
import styles from './AuthForm.module.css';

export default function SignIn() {
  const nav = useNavigate();
  const loc = useLocation();
  const { login, loading, error, token } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState(null);

  useEffect(() => {
    if (token) {
      nav(loc.state?.from || '/', { replace: true });
    }
  }, [token, nav, loc.state]);

  const submit = async e => {
    e.preventDefault();
    setLocalError(null);
    try {
      await login(email, password);
      // navigation will happen in useEffect when token is set
    } catch (e) {
      setLocalError(e?.message || 'Sign in failed');
    }
  };

  return (
    <div className="container">
      <div className="card">
        <h1 className="title">Welcome back</h1>
        <p className="subtitle">Sign in to continue</p>
        <form onSubmit={submit} className="stack">
          <label className="hint">Email</label>
          <input
            className="input"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email"
          />
          <label className="hint">Password</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          {(error || localError) && (
            <div className={styles.err}>{error || localError}</div>
          )}
          <div className={styles.actions}>
            <button disabled={loading} className="btn">
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
            <div className="hint">
              New here?{' '}
              <Link className={styles.link} to="/sign-up">
                Create account
              </Link>
            </div>
            <div className="hint">
              <Link className={styles.link} to="/forgot-password">
                Forgot password?
              </Link>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
