import { forwardRef } from 'react';
import { motion } from 'framer-motion';

const variants = {
  success: 'bg-[var(--bg-tertiary)] text-[var(--state-ok)]',
  warning: 'bg-[var(--bg-tertiary)] text-[var(--state-warn)]',
  danger: 'bg-[var(--bg-tertiary)] text-[var(--state-danger)]',
  info: 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]',
  neutral: 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]',
  primary: 'bg-[var(--accent-emerald)] text-white',
};

const sizes = {
  xs: 'px-1.5 py-0.5 text-xs',
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
  lg: 'px-3 py-1.5 text-base',
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
  full: 'rounded-full',
};

const Badge = forwardRef(({
  children,
  variant = 'neutral',
  size = 'sm',
  rounded = 'full',
  dot = false,
  removable = false,
  onRemove,
  icon,
  animate = false,
  pulse = false,
  className = '',
  ...props
}, ref) => {
  const Component = animate ? motion.span : 'span';
  const animationProps = animate ? {
    initial: { scale: 0.8, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
    transition: { type: 'spring', stiffness: 500, damping: 30 }
  } : {};

  return (
    <Component
      ref={ref}
      className={`
        inline-flex items-center gap-1.5 font-medium
        ${roundedClasses[rounded] ?? 'rounded-full'}
        ${variants[variant]}
        ${sizes[size]}
        ${className}
      `}
      {...animationProps}
      {...props}
    >
      {/* Dot indicator */}
      {dot && (
        <span className={`
          w-1.5 h-1.5 rounded-full
          ${variant === 'success' ? 'bg-emerald-500' : ''}
          ${variant === 'warning' ? 'bg-amber-500' : ''}
          ${variant === 'danger' ? 'bg-red-500' : ''}
          ${variant === 'info' ? 'bg-blue-500' : ''}
          ${variant === 'neutral' ? 'bg-[var(--text-secondary)]' : ''}
          ${variant === 'primary' ? 'bg-white' : ''}
          ${pulse ? 'animate-pulse' : ''}
        `} />
      )}

      {/* Icon */}
      {icon && <span className="flex-shrink-0">{icon}</span>}

      {/* Content */}
      {children}

      {/* Remove button */}
      {removable && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 -mr-1 hover:bg-black/10 rounded-[var(--radius-sm)] p-0.5 transition-colors"
          aria-label="ลบ"
        >
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      )}
    </Component>
  );
});

Badge.displayName = 'Badge';

// Status Badge - predefined statuses
export const StatusBadge = forwardRef(({ status, ...props }, ref) => {
  const statusConfig = {
    pending: { variant: 'warning', label: 'รอดำเนินการ', dot: true },
    preparing: { variant: 'info', label: 'กำลังทำ', dot: true, pulse: true },
    ready: { variant: 'success', label: 'พร้อมเสิร์ฟ', dot: true },
    completed: { variant: 'neutral', label: 'เสร็จสิ้น' },
    cancelled: { variant: 'danger', label: 'ยกเลิก' },
    active: { variant: 'success', label: 'ใช้งาน', dot: true },
    inactive: { variant: 'neutral', label: 'ไม่ใช้งาน' },
    low: { variant: 'danger', label: 'สต็อกต่ำ', dot: true, pulse: true },
    available: { variant: 'success', label: 'มีสินค้า' },
    'out-of-stock': { variant: 'danger', label: 'หมด' },
  };

  const config = statusConfig[status] || { variant: 'neutral', label: status };

  return (
    <Badge
      ref={ref}
      variant={config.variant}
      dot={config.dot}
      pulse={config.pulse}
      {...props}
    >
      {config.label}
    </Badge>
  );
});

StatusBadge.displayName = 'StatusBadge';

// Count Badge - for notifications
export const CountBadge = forwardRef(({ count, max = 99, variant = 'danger', className = '', ...props }, ref) => {
  if (!count || count <= 0) return null;

  const displayCount = count > max ? `${max}+` : count;

  return (
    <Badge
      ref={ref}
      variant={variant}
      size="xs"
      rounded="full"
      animate
      {...props}
      className={`min-w-[1.25rem] justify-center ${className}`}
    >
      {displayCount}
    </Badge>
  );
});

CountBadge.displayName = 'CountBadge';

export default Badge;
