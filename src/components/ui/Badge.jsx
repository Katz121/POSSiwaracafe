import { motion } from 'framer-motion';

const variants = {
  success: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400',
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400',
  danger: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-400',
  neutral: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  primary: 'bg-emerald-500 dark:bg-emerald-600 text-white',
};

const sizes = {
  xs: 'px-1.5 py-0.5 text-xs',
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
  lg: 'px-3 py-1.5 text-base',
};

const Badge = ({
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
}) => {
  const Component = animate ? motion.span : 'span';
  const animationProps = animate ? {
    initial: { scale: 0.8, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
    transition: { type: 'spring', stiffness: 500, damping: 30 }
  } : {};

  return (
    <Component
      className={`
        inline-flex items-center gap-1.5 font-medium
        rounded-${rounded}
        ${variants[variant]}
        ${sizes[size]}
        ${className}
      `}
      {...animationProps}
    >
      {/* Dot indicator */}
      {dot && (
        <span className={`
          w-1.5 h-1.5 rounded-full
          ${variant === 'success' ? 'bg-emerald-500' : ''}
          ${variant === 'warning' ? 'bg-amber-500' : ''}
          ${variant === 'danger' ? 'bg-red-500' : ''}
          ${variant === 'info' ? 'bg-blue-500' : ''}
          ${variant === 'neutral' ? 'bg-gray-500' : ''}
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
          className="ml-0.5 -mr-1 hover:bg-black/10 rounded-full p-0.5 transition-colors"
          aria-label="ลบ"
        >
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      )}
    </Component>
  );
};

// Status Badge - predefined statuses
export const StatusBadge = ({ status, ...props }) => {
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
      variant={config.variant}
      dot={config.dot}
      pulse={config.pulse}
      {...props}
    >
      {config.label}
    </Badge>
  );
};

// Count Badge - for notifications
export const CountBadge = ({ count, max = 99, variant = 'danger', ...props }) => {
  if (!count || count <= 0) return null;

  const displayCount = count > max ? `${max}+` : count;

  return (
    <Badge
      variant={variant}
      size="xs"
      rounded="full"
      animate
      className="min-w-[1.25rem] justify-center"
      {...props}
    >
      {displayCount}
    </Badge>
  );
};

export default Badge;
