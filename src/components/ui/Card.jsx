import { forwardRef } from 'react';
import { motion } from 'framer-motion';

const variants = {
  default: 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700',
  elevated: 'bg-white dark:bg-gray-800 shadow-lg dark:shadow-gray-900/50',
  bordered: 'bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600',
  ghost: 'bg-gray-50 dark:bg-gray-800/50',
  success: 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800',
  warning: 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800',
  danger: 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800',
};

const paddings = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
  xl: 'p-8',
};

// Static lookup — ต้องเป็น full class string เพื่อให้ Tailwind JIT scan ได้
const roundedClasses = {
  none: 'rounded-none',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
  '3xl': 'rounded-3xl',
  full: 'rounded-full',
};

const Card = forwardRef(({
  children,
  variant = 'default',
  padding = 'md',
  rounded = '2xl',
  hoverable = false,
  clickable = false,
  className = '',
  onClick,
  animate = false,
  ...props
}, ref) => {
  const Component = animate ? motion.div : 'div';
  const animationProps = animate ? {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.2 }
  } : {};

  return (
    <Component
      ref={ref}
      onClick={onClick}
      className={`
        ${roundedClasses[rounded] ?? 'rounded-2xl'}
        ${variants[variant]}
        ${paddings[padding]}
        ${hoverable ? 'transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5' : ''}
        ${clickable ? 'cursor-pointer active:scale-[0.98]' : ''}
        ${className}
      `}
      {...animationProps}
      {...props}
    >
      {children}
    </Component>
  );
});

Card.displayName = 'Card';

// Card Header
const CardHeader = forwardRef(({
  children,
  className = '',
  border = true,
  ...props
}, ref) => (
  <div
    ref={ref}
    className={`
      ${border ? 'border-b border-gray-200 dark:border-gray-700 pb-4 mb-4' : 'mb-4'}
      ${className}
    `}
    {...props}
  >
    {children}
  </div>
));

CardHeader.displayName = 'CardHeader';

// Card Body
const CardBody = forwardRef(({ children, className = '', ...props }, ref) => (
  <div ref={ref} className={className} {...props}>
    {children}
  </div>
));

CardBody.displayName = 'CardBody';

// Card Footer
const CardFooter = forwardRef(({
  children,
  className = '',
  border = true,
  ...props
}, ref) => (
  <div
    ref={ref}
    className={`
      ${border ? 'border-t border-gray-200 dark:border-gray-700 pt-4 mt-4' : 'mt-4'}
      flex items-center gap-3
      ${className}
    `}
    {...props}
  >
    {children}
  </div>
));

CardFooter.displayName = 'CardFooter';

// Attach sub-components
Card.Header = CardHeader;
Card.Body = CardBody;
Card.Footer = CardFooter;

export default Card;
