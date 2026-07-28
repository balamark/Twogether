import React from 'react';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  // When true the button is disabled and shows a spinner in place of its
  // leading icon. Pair with `useAsyncAction`'s `pending`.
  loading?: boolean;
  // Optional label shown while loading (defaults to keeping children).
  loadingText?: React.ReactNode;
  variant?: Variant;
  // Optional leading icon; hidden and replaced by the spinner while loading.
  icon?: React.ReactNode;
}

// Codifies the app's de-facto button convention (see AuthModal): solid =
// clickable, 40% dimmed = disabled (docs/UX_PLAYBOOK.md §5). Gives every
// caller immediate in-flight feedback — spinner + label + disabled — right on
// the button the user pressed, which is the surest cue that a tap registered.
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-petal-ink text-petal-cream hover:bg-pink-700',
  secondary:
    'border border-petal-rule text-petal-ink hover:bg-petal-cream-2',
  ghost: 'text-petal-ink-soft hover:text-petal-ink',
};

export const Button: React.FC<ButtonProps> = ({
  loading = false,
  loadingText,
  variant = 'primary',
  icon,
  disabled,
  type = 'button',
  className = '',
  children,
  ...rest
}) => {
  const isDisabled = disabled || loading;
  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading}
      className={`inline-flex items-center justify-center gap-2 rounded-md font-display italic transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      <span>{loading && loadingText != null ? loadingText : children}</span>
    </button>
  );
};

export default Button;
