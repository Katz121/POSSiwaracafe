import { createContext, useContext, useState } from 'react';
import { motion } from 'framer-motion';

// Tabs Context
const TabsContext = createContext(null);

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

  const handleChange = (newValue) => {
    if (value === undefined) {
      setInternalValue(newValue);
    }
    onChange?.(newValue);
  };

  return (
    <TabsContext.Provider value={{ value: activeValue, onChange: handleChange, variant, fullWidth }}>
      <div className={className}>
        {children}
      </div>
    </TabsContext.Provider>
  );
};

// Tabs List
const TabsList = ({ children, className = '' }) => {
  const { variant, fullWidth } = useContext(TabsContext);

  const variants = {
    default: 'bg-gray-100 dark:bg-gray-800 p-1 rounded-xl',
    pills: 'gap-2',
    underline: 'border-b border-gray-200 dark:border-gray-700',
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
  const { value: activeValue, onChange, variant, fullWidth } = useContext(TabsContext);
  const isActive = activeValue === value;

  const baseStyles = 'relative flex items-center justify-center gap-2 font-medium transition-all duration-200 focus:outline-none';

  const variantStyles = {
    default: `
      px-4 py-2 rounded-lg text-sm
      ${isActive
        ? 'text-emerald-700 dark:text-emerald-400'
        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
      }
    `,
    pills: `
      px-4 py-2 rounded-xl text-sm
      ${isActive
        ? 'bg-emerald-500 text-white shadow-md'
        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
      }
    `,
    underline: `
      px-4 py-3 text-sm border-b-2 -mb-px
      ${isActive
        ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'
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
          layoutId="activeTabBg"
          className="absolute inset-0 bg-white dark:bg-gray-700 rounded-lg shadow-sm"
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      )}

      <span className="relative z-10 flex items-center gap-2">
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
  const { value: activeValue } = useContext(TabsContext);
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

// Attach sub-components
Tabs.List = TabsList;
Tabs.Tab = Tab;
Tabs.Panel = TabPanel;

export default Tabs;
