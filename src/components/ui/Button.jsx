import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import Spinner from './Spinner';

// Filled variants always pair the fill with its matching "on" ink token so the
// label stays >= 4.5:1 in both themes (dark-mode accent is light mint).
const PRESS = 'active:scale-[0.98] transition-transform duration-100';
const variants = {
  primary: `bg-[var(--accent)] hover:bg-[var(--accent-hover)] active:bg-[var(--accent-pressed)] text-[var(--text-on-accent)] shadow-[var(--elev-1)] ${PRESS}`,
  secondary: `bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-strong)] ${PRESS}`,
  danger: `bg-[var(--state-danger)] hover:brightness-95 text-[var(--text-on-danger)] shadow-[var(--elev-1)] ${PRESS}`,
  warning: `bg-[var(--state-warn)] hover:brightness-95 text-[var(--text-on-warn)] shadow-[var(--elev-1)] ${PRESS}`,
  ghost: `bg-transparent hover:bg-[var(--bg-hover)] text-[var(--text-primary)] ${PRESS}`,
  outline: `bg-transparent border-2 border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent-soft)] ${PRESS}`,
  'outline-danger': `bg-transparent border-2 border-[var(--state-danger)] text-[var(--state-danger)] hover:bg-[var(--state-danger-soft)] ${PRESS}`,
  // AI actions: neutral outline + violet icon. No gradient surfaces (spec §3.2).
  ai: `bg-[var(--bg-surface)] border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--accent-ai-light)] [&_svg]:text-[var(--accent-ai)] ${PRESS}`,
};

// Heights follow the touch spec: md 44 · lg 48 · xl 56 (POS / KDS actions).
const sizes = {
  xs: 'px-2 py-1 text-xs rounded-[var(--radius-xs)]',
  sm: 'px-3 min-h-9 pointer-coarse:min-h-11 py-1.5 text-sm rounded-[var(--radius-sm)]',
  md: 'px-4 min-h-11 py-2 text-sm rounded-[var(--radius-sm)]',
  lg: 'px-5 min-h-12 py-2.5 text-base rounded-[var(--radius-sm)]',
  xl: 'px-6 min-h-14 py-3 text-lg rounded-[var(--radius)]',
};

const Button = forwardRef(({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  noUppercase = true, // default = ไม่บังคับตัวพิมพ์ใหญ่ (ไทยไม่มีตัวพิมพ์ใหญ่) · ส่ง false ถ้าอยากได้ label อังกฤษตัวใหญ่
  className = '',
  onClick,
  type = 'button',
  ...props
}, ref) => {
  const isDisabled = disabled || loading;

  return (
    <motion.button
      ref={ref}
      type={type}
      whileTap={{ scale: isDisabled ? 1 : 0.97 }}
      onClick={onClick}
      disabled={isDisabled}
      aria-busy={loading}
      className={`
        inline-flex items-center justify-center gap-2
        font-semibold leading-snug
        transition-colors duration-200
        ${noUppercase ? '' : 'uppercase tracking-wide'}
        focus:outline-none focus-visible:shadow-[var(--focus-ring)]
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variants[variant] || variants.primary}
        ${sizes[size] || sizes.md}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      {...props}
    >
      {loading ? (
        <>
          <Spinner size="sm" color={variant === 'primary' || variant === 'danger' || variant === 'warning' ? 'current' : 'emerald'} />
          <span>กำลังโหลด...</span>
        </>
      ) : (
        <>
          {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
          {children}
          {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
        </>
      )}
    </motion.button>
  );
});

Button.displayName = 'Button';

export default Button;
