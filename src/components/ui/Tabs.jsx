import { createContext, useContext, useId, useState } from 'react';
import { motion } from 'framer-motion';

// Tabs Context
const TabsContext = createContext(null);

// Null-guarded context access — throws a descriptive error like useToast
const useTabsContext = (componentName) => {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error(`${componentName} must be used within a <Tabs> component`);
  }
  return context;
};

// Main Tabs Container
const Tabs = ({
  children,
  value,
  onChange,
  defaultValue,
  variant = 'default',
  fullWidth = false,
  className = '',
}) => {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const activeValue = value !== undefined ? value : internalValue;
  // layoutId per-instance — สอง Tabs บนหน้าจอเดียวกันจะไม่ animate ข้ามกัน
  const tabsId = useId();

  const handleChange = (newValue) => {
    if (value === undefined) {
      setInternalValue(newValue);
    }
    onChange?.(newValue);
  };

  return (
    <TabsContext.Provider value={{ value: activeValue, onChange: handleChange, variant, fullWidth, tabsId }}>
      <div className={className}>
        {children}
      </div>
    </TabsContext.Provider>
  );
};

// Tabs List
const TabsList = ({ children, className = '' }) => {
  const { variant, fullWidth } = useTabsContext('Tabs.List');

  const variants = {
    default: 'bg-[var(--bg-tertiary)] p-1 rounded-[var(--radius-sm)]',
    pills: 'gap-2',
    underline: 'border-b border-[var(--border-color)]',
  };

  return (
    <div
      className={`
        flex ${fullWidth ? '' : 'inline-flex'}
        ${variants[variant]}
        ${className}
      `}
      role="tablist"
    >
      {children}
    </div>
  );
};

// Single Tab
const Tab = ({
  children,
  value,
  disabled = false,
  icon,
  className = '',
}) => {
  const { value: activeValue, onChange, variant, fullWidth, tabsId } = useTabsContext('Tabs.Tab');
  const isActive = activeValue === value;

  const baseStyles = 'relative flex items-center justify-center gap-2 font-medium transition-all duration-200 focus:outline-none';

  const variantStyles = {
    default: `
      px-4 py-2 rounded-[var(--radius-sm)] text-sm
      ${isActive
        ? 'text-[var(--accent-emerald)]'
        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
      }
    `,
    pills: `
      px-4 py-2 rounded-[var(--radius-sm)] text-sm
      ${isActive
        ? 'bg-[var(--accent-emerald)] text-white shadow-[var(--elev-1)]'
        : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--border-light)]'
      }
    `,
    underline: `
      px-4 py-3 text-sm border-b-2 -mb-px
      ${isActive
        ? 'border-[var(--accent-emerald)] text-[var(--accent-emerald)]'
        : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-color)]'
      }
    `,
  };

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      disabled={disabled}
      onClick={() => !disabled && onChange(value)}
      className={`
        ${baseStyles}
        ${variantStyles[variant]}
        ${fullWidth ? 'flex-1' : ''}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${className}
      `}
    >
      {/* Active background for default variant */}
      {variant === 'default' && isActive && (
        <motion.div
          layoutId={`${tabsId}-activeTabBg`}
          className="absolute inset-0 bg-[var(--bg-secondary)] rounded-[var(--radius-sm)] shadow-[var(--elev-1)]"
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      )}

      <span className="relative z-[var(--z-dropdown)] flex items-center gap-2">
        {icon && <span className="w-4 h-4">{icon}</span>}
        {children}
      </span>
    </button>
  );
};

// Tab Panel
const TabPanel = ({
  children,
  value,
  className = '',
  keepMounted = false,
}) => {
  const { value: activeValue } = useTabsContext('Tabs.Panel');
  const isActive = activeValue === value;

  if (!isActive && !keepMounted) {
    return null;
  }

  return (
    <motion.div
      role="tabpanel"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: isActive ? 1 : 0, y: isActive ? 0 : 10 }}
      transition={{ duration: 0.2 }}
      className={`${className} ${!isActive && keepMounted ? 'hidden' : ''}`}
      hidden={!isActive}
    >
      {children}
    </motion.div>
  );
};

Tabs.displayName = 'Tabs';
TabsList.displayName = 'Tabs.List';
Tab.displayName = 'Tabs.Tab';
TabPanel.displayName = 'Tabs.Panel';

// Attach sub-components
Tabs.List = TabsList;
Tabs.Tab = Tab;
Tabs.Panel = TabPanel;

export default Tabs;
