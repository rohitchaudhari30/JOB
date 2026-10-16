import React from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** Required for icon-only buttons (no visible text). */
  'aria-label'?: string;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-indigo-600 hover:bg-indigo-700 text-white border-transparent',
  secondary:
    'bg-white hover:bg-slate-50 text-slate-800 border-slate-300 dark:bg-slate-900 dark:hover:bg-slate-800 dark:text-slate-100 dark:border-slate-700',
  ghost: 'bg-transparent hover:bg-slate-100 text-slate-700 border-transparent dark:text-slate-200 dark:hover:bg-slate-800',
  danger: 'bg-rose-700 hover:bg-rose-800 text-white border-transparent',
};

const SIZES: Record<Size, string> = {
  sm: 'min-h-9 px-3 text-xs',
  md: 'min-h-10 px-4 text-sm',
};

/** Single button primitive: consistent radius, focus ring, disabled/loading states. */
export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}) => (
  <button
    type={type}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    className={`inline-flex items-center justify-center gap-1.5 rounded-lg border font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    {...rest}
  >
    {loading && (
      <span
        aria-hidden="true"
        className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin motion-reduce:animate-none"
      />
    )}
    {children}
  </button>
);
