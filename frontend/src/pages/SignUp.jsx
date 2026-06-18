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
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <div className={styles.logoMark}>A</div>
          <div className={styles.logoName}>API Tester</div>
        </div>
        <h1 className={styles.title}>Create account</h1>
        <p className={styles.subtitle}>Sign up to get started</p>
        <form onSubmit={submit} className={styles.stack}>
          <label className={styles.label}>Email</label>
          <input
            className={styles.input}
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <label className={styles.label}>Password</label>
          <input
            className={styles.input}
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
          {error && <div className={styles.error}>{error}</div>}
          {ok && <div className={styles.success}>{ok}</div>}
          <div className={styles.stack}>
            <button disabled={loading} className={styles.submitBtn}>
              {loading ? 'Creating...' : 'Sign up'}
            </button>
            <div className={styles.hint}>
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
