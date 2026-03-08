import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import Spinner from './Spinner';

const variants = {
  primary: 'bg-emerald-500 hover:bg-emerald-600 text-white border-b-4 border-emerald-700 active:border-b-2 active:translate-y-0.5',
  secondary: 'bg-gray-100 hover:bg-gray-200 text-gray-700 border-b-4 border-gray-300 active:border-b-2 active:translate-y-0.5 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 dark:border-gray-800',
  danger: 'bg-red-500 hover:bg-red-600 text-white border-b-4 border-red-700 active:border-b-2 active:translate-y-0.5',
  warning: 'bg-amber-500 hover:bg-amber-600 text-white border-b-4 border-amber-700 active:border-b-2 active:translate-y-0.5',
  ghost: 'bg-transparent hover:bg-gray-100 text-gray-700 dark:text-gray-300 dark:hover:bg-gray-800',
  outline: 'bg-transparent border-2 border-emerald-500 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20',
  'outline-danger': 'bg-transparent border-2 border-red-500 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20',
};

const sizes = {
  xs: 'px-2 py-1 text-xs rounded-lg',
  sm: 'px-3 py-1.5 text-sm rounded-xl',
  md: 'px-4 py-2 text-sm rounded-xl',
  lg: 'px-6 py-3 text-base rounded-2xl',
  xl: 'px-8 py-4 text-lg rounded-2xl',
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
  noUppercase = false,
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
      className={`
        inline-flex items-center justify-center gap-2
        font-bold tracking-wider
        ${noUppercase ? '' : 'uppercase'}
        transition-all duration-200
        focus:outline-none focus:ring-4 focus:ring-emerald-500/20
        disabled:opacity-50 disabled:cursor-not-allowed disabled:active:translate-y-0
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
