import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../store/session.jsx';

const ForgotPassword = () => {
  const { forgotPassword, resetPassword } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [step, setStep] = useState(1); // 1: Enter Email, 2: Enter OTP, 3: Success
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [validationError, setValidationError] = useState('');

  const handleRequestOTP = async e => {
    e.preventDefault();
    setValidationError('');

    if (!email) {
      setValidationError('Email is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await forgotPassword(email);
      if (result.success) {
        setStep(2);
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError('Failed to send reset email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async e => {
    e.preventDefault();
    setValidationError('');

    if (!otp) {
      setValidationError('OTP is required');
      return;
    }

    if (!newPassword) {
      setValidationError('New password is required');
      return;
    }

    if (newPassword !== confirmPassword) {
      setValidationError('Passwords do not match');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await resetPassword(email, otp, newPassword);
      if (result.success) {
        setStep(3);
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError('Failed to reset password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const styles = {
    container: {
      maxWidth: '400px',
      margin: '20px auto',
      padding: '20px',
      backgroundColor: 'var(--card-bg)',
      borderRadius: '8px',
      boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
    },
    title: {
      textAlign: 'center',
      color: 'var(--text-color)',
      marginBottom: '20px',
    },
    form: {
      display: 'flex',
      flexDirection: 'column',
      gap: '15px',
    },
    formGroup: {
      display: 'flex',
      flexDirection: 'column',
      gap: '5px',
    },
    label: {
      color: 'var(--text-color)',
      fontSize: '0.9rem',
    },
    input: {
      padding: '10px',
      borderRadius: '4px',
      border: '1px solid var(--border-color)',
      backgroundColor: 'var(--input-bg)',
      color: 'var(--text-color)',
    },
    button: {
      padding: '10px',
      backgroundColor: 'var(--primary-color)',
      color: 'white',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      fontWeight: 'bold',
      marginTop: '10px',
    },
    error: {
      color: 'red',
      fontSize: '0.9rem',
      marginTop: '10px',
    },
    linkButton: {
      background: 'none',
      border: 'none',
      color: 'var(--primary-color)',
      cursor: 'pointer',
      padding: '0',
      fontSize: '0.9rem',
      textDecoration: 'underline',
    },
    success: {
      textAlign: 'center',
      color: 'green',
    },
    steps: {
      display: 'flex',
      justifyContent: 'center',
      marginBottom: '20px',
    },
    step: {
      width: '30px',
      height: '30px',
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      margin: '0 5px',
      border: '1px solid var(--border-color)',
      color: 'var(--text-color)',
    },
    activeStep: {
      backgroundColor: 'var(--primary-color)',
      color: 'white',
      border: 'none',
    },
    completedStep: {
      backgroundColor: 'green',
      color: 'white',
      border: 'none',
    },
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Forgot Password</h2>

      <div style={styles.steps}>
        <div
          style={{
            ...styles.step,
            ...(step >= 1 ? styles.activeStep : {}),
            ...(step > 1 ? styles.completedStep : {}),
          }}
        >
          1
        </div>
        <div
          style={{
            ...styles.step,
            ...(step >= 2 ? styles.activeStep : {}),
            ...(step > 2 ? styles.completedStep : {}),
          }}
        >
          2
        </div>
        <div
          style={{
            ...styles.step,
            ...(step === 3 ? styles.completedStep : {}),
          }}
        >
          3
        </div>
      </div>

      {step === 1 && (
        <form style={styles.form} onSubmit={handleRequestOTP}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Email</label>
            <input
              style={styles.input}
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Enter your email address"
              required
            />
          </div>

          {error && <p style={styles.error}>{error}</p>}
          {validationError && <p style={styles.error}>{validationError}</p>}

          <button style={styles.button} type="submit" disabled={loading}>
            {loading ? 'Sending...' : 'Request OTP'}
          </button>

          <button
            style={styles.linkButton}
            type="button"
            onClick={() => navigate('/sign-in')}
          >
            Back to Sign In
          </button>
        </form>
      )}

      {step === 2 && (
        <form style={styles.form} onSubmit={handleResetPassword}>
          <div style={styles.formGroup}>
            <label style={styles.label}>OTP Code</label>
            <input
              style={styles.input}
              type="text"
              value={otp}
              onChange={e => setOtp(e.target.value)}
              placeholder="Enter OTP sent to your email"
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>New Password</label>
            <input
              style={styles.input}
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Confirm Password</label>
            <input
              style={styles.input}
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              required
            />
          </div>

          {error && <p style={styles.error}>{error}</p>}
          {validationError && <p style={styles.error}>{validationError}</p>}

          <button style={styles.button} type="submit" disabled={loading}>
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>
      )}

      {step === 3 && (
        <div style={styles.success}>
          <p>Password reset successful!</p>
          <p>You can now sign in with your new password.</p>
          <button
            style={{ ...styles.button, width: '100%' }}
            onClick={() => navigate('/sign-in')}
          >
            Go to Sign In
          </button>
        </div>
      )}
    </div>
  );
};

export default ForgotPassword;
