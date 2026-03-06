import { forwardRef } from 'react';
import { motion } from 'framer-motion';

const variants = {
  primary: 'bg-emerald-500 hover:bg-emerald-600 text-white',
  secondary: 'bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200',
  danger: 'bg-red-500 hover:bg-red-600 text-white',
  warning: 'bg-amber-500 hover:bg-amber-600 text-white',
  ghost: 'bg-transparent hover:bg-gray-100 text-gray-600 dark:text-gray-400 dark:hover:bg-gray-800',
  outline: 'bg-transparent border-2 border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800',
};

const sizes = {
  xs: 'w-6 h-6 text-xs',
  sm: 'w-8 h-8 text-sm',
  md: 'w-10 h-10 text-base',
  lg: 'w-12 h-12 text-lg',
  xl: 'w-14 h-14 text-xl',
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
        rounded-${rounded}
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
