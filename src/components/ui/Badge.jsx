import { forwardRef } from 'react';
import { motion } from 'framer-motion';

// Soft tinted backgrounds + semantic ink (all >= 4.5:1 in both themes).
const variants = {
  success: 'bg-[var(--state-ok-soft)] text-[var(--state-ok)]',
  warning: 'bg-[var(--state-warn-soft)] text-[var(--state-warn)]',
  danger: 'bg-[var(--state-danger-soft)] text-[var(--state-danger)]',
  info: 'bg-[var(--state-info-soft)] text-[var(--state-info)]',
  neutral: 'bg-[var(--bg-sunken)] text-[var(--text-secondary)]',
  primary: 'bg-[var(--accent)] text-[var(--text-on-accent)]',
  accent: 'bg-[var(--accent-soft)] text-[var(--accent-soft-fg)]',
  ai: 'bg-[var(--accent-ai-light)] text-[var(--accent-ai)]',
};

// `tone` (spec name) → variant
const TONE_TO_VARIANT = { ok: 'success', warn: 'warning', danger: 'danger', info: 'info', neutral: 'neutral', accent: 'accent', ai: 'ai' };

const dotColors = {
  success: 'bg-[var(--state-ok)]',
  warning: 'bg-[var(--state-warn)]',
  danger: 'bg-[var(--state-danger)]',
  info: 'bg-[var(--state-info)]',
  neutral: 'bg-[var(--text-secondary)]',
  primary: 'bg-[var(--text-on-accent)]',
  accent: 'bg-[var(--accent)]',
  ai: 'bg-[var(--accent-ai)]',
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
  variant: variantProp = 'neutral',
  tone,
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
  const variant = (tone && TONE_TO_VARIANT[tone]) || variantProp;
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
        inline-flex items-center gap-1.5 font-medium leading-normal whitespace-nowrap
        ${roundedClasses[rounded] ?? 'rounded-full'}
        ${variants[variant] || variants.neutral}
        ${sizes[size]}
        ${className}
      `}
      {...animationProps}
      {...props}
    >
      {/* Dot indicator */}
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant] || dotColors.neutral} ${pulse ? 'animate-pulse' : ''}`} />
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

// Count Badge · nav / tab counters. `solid` (default) = filled pill that reads
// on any surface; `soft` = tinted. Renders nothing for 0 / empty.
const COUNT_SOLID = {
  danger: 'bg-[var(--state-danger)] text-[var(--text-on-danger)]',
  warning: 'bg-[var(--state-warn)] text-[var(--text-on-warn)]',
  primary: 'bg-[var(--accent)] text-[var(--text-on-accent)]',
  neutral: 'bg-[var(--surface-inverse)] text-[var(--text-on-inverse)]',
};

export const CountBadge = forwardRef(({ count, max = 99, variant = 'danger', tone, appearance = 'solid', className = '', ...props }, ref) => {
  if (!count || count <= 0) return null;

  const displayCount = count > max ? `${max}+` : count;
  const v = (tone && TONE_TO_VARIANT[tone]) || variant;

  if (appearance === 'solid') {
    return (
      <span
        ref={ref}
        className={`inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[11px] font-semibold num leading-none ${COUNT_SOLID[v] || COUNT_SOLID.danger} ${className}`}
        {...props}
      >
        {displayCount}
      </span>
    );
  }

  return (
    <Badge
      ref={ref}
      variant={v}
      size="xs"
      rounded="full"
      {...props}
      className={`min-w-[1.25rem] justify-center num ${className}`}
    >
      {displayCount}
    </Badge>
  );
});

CountBadge.displayName = 'CountBadge';

export default Badge;
