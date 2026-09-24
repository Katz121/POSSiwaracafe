import { forwardRef } from 'react';
import { motion } from 'framer-motion';

const variants = {
  primary: 'bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-on-accent)]',
  secondary: 'bg-[var(--bg-sunken)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)]',
  danger: 'bg-[var(--state-danger)] text-[var(--text-on-danger)]',
  warning: 'bg-[var(--state-warn)] text-[var(--text-on-warn)]',
  ghost: 'bg-transparent hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]',
  outline: 'bg-transparent border border-[var(--border-strong)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
};

const sizes = {
  xs: 'w-6 h-6 text-xs',
  sm: 'w-8 h-8 text-sm',
  md: 'w-10 h-10 text-base',
  lg: 'w-12 h-12 text-lg',
  xl: 'w-14 h-14 text-xl',
};

// Static lookup — ต้องเป็น full class string เพื่อให้ Tailwind JIT scan ได้
const roundedClasses = {
  none: 'rounded-none',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-[var(--radius-sm)]',
  xl: 'rounded-[var(--radius-sm)]',
  '2xl': 'rounded-[var(--radius-sm)]',
  '3xl': 'rounded-[var(--radius-sm)]',
  full: 'rounded-[var(--radius-sm)]',
};

const IconButton = forwardRef(({
  icon,
  variant = 'ghost',
  size = 'md',
  rounded = 'full',
  disabled = false,
  className = '',
  onClick,
  'aria-label': ariaLabel,
  ...props
}, ref) => {
  return (
    <motion.button
      ref={ref}
      type="button"
      whileTap={{ scale: disabled ? 1 : 0.9 }}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`
        inline-flex items-center justify-center
        pointer-coarse:min-w-11 pointer-coarse:min-h-11
        ${roundedClasses[rounded] ?? 'rounded-full'}
        transition-all duration-200
        focus:outline-none focus-visible:shadow-[var(--focus-ring)]
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variants[variant]}
        ${sizes[size]}
        ${className}
      `}
      {...props}
    >
      {icon}
    </motion.button>
  );
});

IconButton.displayName = 'IconButton';

export default IconButton;
