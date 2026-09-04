/* eslint-disable react-refresh/only-export-components -- exports useToast hook + ToastProvider together by design */
import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

// Toast Context
const ToastContext = createContext(null);

// Toast configurations
const toastConfig = {
  success: {
    icon: CheckCircle,
    className: 'bg-emerald-500 text-white',
    iconClass: 'text-white',
  },
  error: {
    icon: XCircle,
    className: 'bg-red-500 text-white',
    iconClass: 'text-white',
  },
  warning: {
    icon: AlertTriangle,
    className: 'bg-amber-500 text-white',
    iconClass: 'text-white',
  },
  info: {
    icon: Info,
    className: 'bg-blue-500 text-white',
    iconClass: 'text-white',
  },
};

// Single Toast Component
const ToastItem = ({ id, type, message, onDismiss }) => {
  const config = toastConfig[type] || toastConfig.info;
  const Icon = config.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 100, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={`
        flex items-center gap-3 px-4 py-3
        rounded-[var(--radius-sm)] shadow-[var(--elev-3)]
        min-w-[280px] max-w-[400px]
        ${config.className}
      `}
    >
      <Icon size={20} className={config.iconClass} />
      <p className="flex-1 text-sm font-medium">{message}</p>
      <button
        onClick={() => onDismiss(id)}
        className="p-1 hover:bg-white/20 rounded-full transition-colors"
        aria-label="ปิด"
      >
        <X size={16} />
      </button>
    </motion.div>
  );
};

ToastItem.displayName = 'ToastItem';

// Toast Container
const ToastContainer = ({ toasts, removeToast }) => {
  return (
    <div
      className="fixed top-4 right-4 z-[var(--z-toast)] flex flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            {...toast}
            onDismiss={removeToast}
          />
        ))}
      </AnimatePresence>
    </div>
  );
};

ToastContainer.displayName = 'ToastContainer';

// Toast Provider
export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Set());

  const addToast = useCallback((type, message, duration = 4000) => {
    const id = Date.now() + Math.random();

    setToasts((prev) => [...prev, { id, type, message }]);

    if (duration > 0) {
      const timerId = setTimeout(() => {
        timersRef.current.delete(timerId);
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
      timersRef.current.add(timerId);
    }

    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Clear pending timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timerId) => clearTimeout(timerId));
      timers.clear();
    };
  }, []);

  const toast = useMemo(() => ({
    success: (message, duration) => addToast('success', message, duration),
    error: (message, duration) => addToast('error', message, duration),
    warning: (message, duration) => addToast('warning', message, duration),
    info: (message, duration) => addToast('info', message, duration),
    dismiss: removeToast,
    dismissAll: () => setToasts([]),
  }), [addToast, removeToast]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
};

ToastProvider.displayName = 'ToastProvider';

// Hook to use toast
export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export default ToastProvider;
