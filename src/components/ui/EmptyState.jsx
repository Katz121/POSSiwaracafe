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

const EmptyState = ({
  icon = 'default',
  title = 'ไม่พบข้อมูล',
  description,
  action,
  actionLabel,
  onAction,
  size = 'md',
  className = '',
}) => {
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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`
        flex flex-col items-center justify-center text-center
        ${s.padding}
        ${className}
      `}
    >
      <div className="mb-4 p-4 rounded-full bg-gray-100 dark:bg-gray-800">
        <Icon
          size={s.icon}
          className="text-gray-400 dark:text-gray-500"
          strokeWidth={1.5}
        />
      </div>

      <h3 className={`font-semibold text-gray-700 dark:text-gray-300 ${s.title}`}>
        {title}
      </h3>

      {description && (
        <p className={`mt-1 text-gray-500 dark:text-gray-400 max-w-sm ${s.desc}`}>
          {description}
        </p>
      )}

      {(action || (actionLabel && onAction)) && (
        <div className="mt-4">
          {action || (
            <Button variant="primary" size="sm" onClick={onAction}>
              {actionLabel}
            </Button>
          )}
        </div>
      )}
    </motion.div>
  );
};

export default EmptyState;
