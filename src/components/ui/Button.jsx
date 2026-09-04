import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import Spinner from './Spinner';

const variants = {
  primary: 'bg-[var(--accent-emerald)] hover:bg-[var(--accent-emerald-dark)] text-white shadow-[var(--elev-1)] active:scale-[0.98] transition-transform duration-100',
  secondary: 'bg-[var(--bg-tertiary)] hover:bg-[var(--border-light)] text-[var(--text-primary)] shadow-[var(--elev-1)] active:scale-[0.98] transition-transform duration-100',
  danger: 'bg-[var(--state-danger)] hover:brightness-95 text-white shadow-[var(--elev-1)] active:scale-[0.98] transition-transform duration-100',
  warning: 'bg-[var(--state-warn)] hover:brightness-95 text-white shadow-[var(--elev-1)] active:scale-[0.98] transition-transform duration-100',
  ghost: 'bg-transparent hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] active:scale-[0.98] transition-transform duration-100',
  outline: 'bg-transparent border-2 border-[var(--accent-emerald)] text-[var(--accent-emerald)] hover:bg-[var(--bg-tertiary)] active:scale-[0.98] transition-transform duration-100',
  'outline-danger': 'bg-transparent border-2 border-[var(--state-danger)] text-[var(--state-danger)] hover:bg-[var(--bg-tertiary)] active:scale-[0.98] transition-transform duration-100',
};

const sizes = {
  xs: 'px-2 py-1 text-xs rounded-[var(--radius-sm)]',
  sm: 'px-3 py-1.5 text-sm rounded-[var(--radius-sm)]',
  md: 'px-4 py-2 text-sm rounded-[var(--radius-sm)]',
  lg: 'px-6 py-3 text-base rounded-[var(--radius-sm)]',
  xl: 'px-8 py-4 text-lg rounded-[var(--radius-sm)]',
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
  noUppercase = false, // legacy: ปุ่มไม่บังคับ uppercase แล้ว คง prop ไว้ไม่ให้ caller พัง
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
        font-bold tracking-wider
        transition-all duration-200
        focus:outline-none focus:ring-4 focus:ring-[var(--accent-emerald-light)]
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variants[variant]}
        ${sizes[size]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      {...props}
    >
      {loading ? (
        <>
          <Spinner size="sm" color={variant === 'primary' || variant === 'danger' || variant === 'warning' ? 'white' : 'emerald'} />
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
