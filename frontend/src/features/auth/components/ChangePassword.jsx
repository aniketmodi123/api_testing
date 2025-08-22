import { useState } from 'react';
import { useAuth } from '../../../store/session.jsx';

const ChangePassword = () => {
  const { forgotPassword, resetPassword } = useAuth();
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);
  const [resetPasswordError, setResetPasswordError] = useState(null);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpError, setOtpError] = useState(null);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [step, setStep] = useState(1); // 1: Enter Email, 2: Enter OTP, 3: Set New Password
  const [validationError, setValidationError] = useState('');

  const handleRequestOTP = async e => {
    e.preventDefault();
    setValidationError('');

    if (!email) {
      setValidationError('Email is required');
      return;
    }

    setOtpLoading(true);
    setOtpError(null);

    try {
      const result = await forgotPassword(email);
      if (result.success) {
        setOtpSent(true);
        setStep(2);
      } else {
        setOtpError(result.message);
      }
    } catch (error) {
      setOtpError('Failed to send OTP. Please try again.');
      console.error('Failed to request OTP:', error);
    } finally {
      setOtpLoading(false);
    }
  };

  const handleSetNewPassword = async e => {
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

    setResetPasswordLoading(true);
    setResetPasswordError(null);

    try {
      const result = await resetPassword(email, otp, newPassword);
      if (result.success) {
        setStep(3);
      } else {
        setResetPasswordError(result.message);
      }
    } catch (error) {
      setResetPasswordError('Failed to reset password. Please try again.');
      console.error('Failed to reset password:', error);
    } finally {
      setResetPasswordLoading(false);
    }
  };

  const styles = {
    container: {
      maxWidth: '400px',
      margin: '0 auto',
      padding: '2rem',
    },
    title: {
      fontSize: '1.5rem',
      fontWeight: 'bold',
      marginBottom: '1.5rem',
      color: 'var(--text-color)',
      textAlign: 'center',
    },
    formSection: {
      backgroundColor: 'var(--card-bg)',
      borderRadius: '0.5rem',
      padding: '1.5rem',
      marginBottom: '1.5rem',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    },
    formGroup: {
      marginBottom: '1rem',
    },
    label: {
      display: 'block',
      marginBottom: '0.5rem',
      fontWeight: '500',
      color: 'var(--muted)',
    },
    input: {
      width: '100%',
      padding: '0.5rem',
      border: '1px solid var(--border-color)',
      borderRadius: '0.25rem',
      backgroundColor: 'var(--input)',
      color: 'var(--text-color)',
    },
    button: {
      width: '100%',
      backgroundColor: 'var(--primary)',
      color: '#fff',
      border: 'none',
      borderRadius: '0.25rem',
      padding: '0.75rem',
      cursor: 'pointer',
      fontWeight: '500',
      marginTop: '1rem',
    },
    errorMessage: {
      color: '#e53e3e',
      fontSize: '0.875rem',
      marginTop: '0.5rem',
    },
    successMessage: {
      color: '#38a169',
      fontSize: '0.875rem',
      marginTop: '0.5rem',
      textAlign: 'center',
    },
    stepIndicator: {
      display: 'flex',
      justifyContent: 'center',
      marginBottom: '1.5rem',
    },
    step: {
      width: '30px',
      height: '30px',
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      margin: '0 0.5rem',
      backgroundColor: 'var(--border-color)',
      color: 'var(--text-color)',
      fontWeight: 'bold',
      fontSize: '0.875rem',
    },
    activeStep: {
      backgroundColor: 'var(--primary)',
      color: '#fff',
    },
    completedStep: {
      backgroundColor: '#38a169',
      color: '#fff',
    },
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Reset Password</h1>

      <div style={styles.stepIndicator}>
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
            ...(step >= 3 ? styles.completedStep : {}),
          }}
        >
          3
        </div>
      </div>

      <div style={styles.formSection}>
        {step === 1 && (
          <form onSubmit={handleRequestOTP}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Email Address</label>
              <input
                style={styles.input}
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Enter your email address"
                required
              />
            </div>
            {otpError && <div style={styles.errorMessage}>{otpError}</div>}
            {validationError && (
              <div style={styles.errorMessage}>{validationError}</div>
            )}
            <button type="submit" style={styles.button} disabled={otpLoading}>
              {otpLoading ? 'Sending OTP...' : 'Request OTP'}
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleSetNewPassword}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Enter OTP</label>
              <input
                style={styles.input}
                type="text"
                value={otp}
                onChange={e => setOtp(e.target.value)}
                placeholder="Enter the OTP sent to your email"
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
            {resetPasswordError && (
              <div style={styles.errorMessage}>{resetPasswordError}</div>
            )}
            {validationError && (
              <div style={styles.errorMessage}>{validationError}</div>
            )}
            <button
              type="submit"
              style={styles.button}
              disabled={resetPasswordLoading}
            >
              {resetPasswordLoading
                ? 'Resetting Password...'
                : 'Reset Password'}
            </button>
          </form>
        )}

        {step === 3 && (
          <div style={styles.successMessage}>
            <p>Your password has been reset successfully!</p>
            <p>You can now login with your new password.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChangePassword;
