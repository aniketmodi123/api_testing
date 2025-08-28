import React from 'react';
import styles from './Button.module.css';

/**
 * Reusable Button component
 * @param {Object} props - Component props
 * @param {string} props.variant - Button variant (primary, secondary, danger)
 * @param {string} props.size - Button size (small, medium, large)
 * @param {boolean} props.fullWidth - Whether the button should take full width
 * @param {boolean} props.disabled - Whether the button is disabled
 * @param {function} props.onClick - Click handler
 * @param {string} props.type - Button type (button, submit, reset)
 * @param {React.ReactNode} props.children - Button content
 * @returns {JSX.Element}
 */
const Button = ({
  variant = 'primary',
  size = 'medium',
  fullWidth = false,
  disabled = false,
  onClick,
  type = 'button',
  children,
  className = '',
  ...rest
}) => {
  // Ensure variant and size exist in our styles
  const validVariant = ['primary', 'secondary', 'danger'].includes(variant)
    ? variant
    : 'primary';
  const validSize = ['small', 'medium', 'large'].includes(size)
    ? size
    : 'medium';

  const buttonClasses = [
    styles.button,
    styles[validVariant],
    styles[validSize],
    fullWidth ? styles.fullWidth : '',
    className, // Add any additional className passed as prop
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      className={buttonClasses}
      disabled={disabled}
      onClick={onClick}
      type={type}
      {...rest}
    >
      {children}
    </button>
  );
};

// Removed PropTypes validation for compatibility

export default Button;
