import { forwardRef } from 'react';
import { motion } from 'framer-motion';

const variants = {
  primary: 'bg-[var(--accent-emerald)] hover:bg-[var(--accent-emerald-dark)] text-white',
  secondary: 'bg-[var(--bg-tertiary)] hover:bg-[var(--border-light)] text-[var(--text-primary)]',
  danger: 'bg-[var(--state-danger)] text-white',
  warning: 'bg-[var(--state-warn)] text-white',
  ghost: 'bg-transparent hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)]',
  outline: 'bg-transparent border-2 border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]',
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
        ${roundedClasses[rounded] ?? 'rounded-full'}
        transition-all duration-200
        focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2
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
