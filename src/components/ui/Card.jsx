import { forwardRef } from 'react';
import { motion } from 'framer-motion';

const variants = {
  default: 'bg-[var(--bg-secondary)] border border-[var(--border-color)]',
  elevated: 'bg-[var(--bg-secondary)] shadow-[var(--elev-1)]',
  bordered: 'bg-[var(--bg-secondary)] border-2 border-[var(--border-color)]',
  ghost: 'bg-[var(--bg-tertiary)]',
  success: 'bg-[var(--accent-emerald-light)] border border-[var(--state-ok)]',
  warning: 'bg-[var(--accent-orange-light)] border border-[var(--state-warn)]',
  danger: 'bg-[var(--bg-secondary)] border border-[var(--state-danger)]',
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
  // Design-token defaults — use these instead of the fixed Tailwind steps above
  card: 'rounded-[var(--radius)]',
  control: 'rounded-[var(--radius-sm)]',
};

const Card = forwardRef(({
  children,
  variant = 'default',
  padding = 'md',
  rounded = 'card',
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
        ${roundedClasses[rounded] ?? roundedClasses.card}
        ${variants[variant]}
        ${paddings[padding]}
        ${hoverable ? 'transition-all duration-200 hover:shadow-[var(--elev-2)] hover:-translate-y-0.5' : ''}
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
      ${border ? 'border-b border-[var(--border-color)] pb-4 mb-4' : 'mb-4'}
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
      ${border ? 'border-t border-[var(--border-color)] pt-4 mt-4' : 'mt-4'}
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
