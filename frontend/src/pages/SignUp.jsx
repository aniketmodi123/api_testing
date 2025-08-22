import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/session.jsx';
import styles from './AuthForm.module.css';

export default function SignUp() {
  const nav = useNavigate();
  const { signup, loading, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ok, setOk] = useState(null);

  useEffect(() => {
    if (ok && !error) {
      const timer = setTimeout(() => nav('/sign-in', { replace: true }), 600);
      return () => clearTimeout(timer);
    }
  }, [ok, error, nav]);

  const submit = async e => {
    e.preventDefault();
    setOk(null);

    // Basic validation
    if (!email || !password) {
      return; // Form validation will handle this with required attributes
    }

    try {
      // Create user data object as expected by the enhanced signup function
      const userData = {
        email,
        password,
      };

      const result = await signup(userData);

      // Only set success message if signup was successful
      if (result.success) {
        setOk('Account created successfully! Redirecting to sign in...');
        // navigation will happen in useEffect
      }
    } catch (e) {
      // error is handled by context, but won't show success message
      console.log('Signup error in component:', e);
    }
  };

  return (
    <div className="container">
      <div className="card">
        <h1 className="title">Create account</h1>
        <p className="subtitle">Sign up to get started</p>
        <form onSubmit={submit} className="stack">
          <label className="hint">Email</label>
          <input
            className="input"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <label className="hint">Password</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
          {error && <div className={styles.err}>{error}</div>}
          {ok && (
            <div className="hint" style={{ color: '#16a34a' }}>
              {ok}
            </div>
          )}
          <div className={styles.actions}>
            <button disabled={loading} className="btn">
              {loading ? 'Creating...' : 'Sign up'}
            </button>
            <div className="hint">
              Already have an account?{' '}
              <Link className={styles.link} to="/sign-in">
                Sign in
              </Link>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
