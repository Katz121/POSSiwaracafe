import { forwardRef, isValidElement } from 'react';
import { motion } from 'framer-motion';
import { Package, Search, FileX, AlertCircle, ShoppingCart, Users, Receipt } from 'lucide-react';
import Button from './Button';

const icons = {
  default: Package,
  search: Search,
  file: FileX,
  error: AlertCircle,
  cart: ShoppingCart,
  users: Users,
  receipt: Receipt,
};

const EmptyState = forwardRef(({
  icon = 'default',
  title = 'ไม่พบข้อมูล',
  description,
  action,
  actionLabel,
  onAction,
  size = 'md',
  className = '',
  ...props
}, ref) => {
  const Icon = typeof icon === 'string' ? icons[icon] || icons.default : icon;

  const sizes = {
    sm: {
      icon: 40,
      title: 'text-base',
      desc: 'text-sm',
      padding: 'py-8',
    },
    md: {
      icon: 56,
      title: 'text-lg',
      desc: 'text-sm',
      padding: 'py-12',
    },
    lg: {
      icon: 72,
      title: 'text-xl',
      desc: 'text-base',
      padding: 'py-16',
    },
  };

  const s = sizes[size];

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`
        flex flex-col items-center justify-center text-center
        ${s.padding}
        ${className}
      `}
      {...props}
    >
      <div className="mb-4 p-4 rounded-[var(--radius-sm)] bg-[var(--bg-tertiary)]">
        <Icon
          size={s.icon}
          className="text-[var(--text-muted)]"
          strokeWidth={1.5}
        />
      </div>

      <h3 className={`font-semibold text-[var(--text-primary)] ${s.title}`}>
        {title}
      </h3>

      {description && (
        <p className={`mt-1 text-[var(--text-secondary)] max-w-sm ${s.desc}`}>
          {description}
        </p>
      )}

      {(action || (actionLabel && onAction)) && (
        <div className="mt-4">
          {isValidElement(action) ? (
            action
          ) : action && typeof action === 'object' ? (
            // Tolerate an { label, onClick } object (a common caller shape) instead
            // of crashing with React error #31 "objects are not valid as a child".
            <Button variant="primary" size="sm" onClick={action.onClick}>
              {action.label}
            </Button>
          ) : (
            <Button variant="primary" size="sm" onClick={onAction}>
              {actionLabel}
            </Button>
          )}
        </div>
      )}
    </motion.div>
  );
});

EmptyState.displayName = 'EmptyState';

export default EmptyState;
