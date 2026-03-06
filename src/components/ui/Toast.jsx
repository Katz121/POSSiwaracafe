import { createContext, useContext, useState, useCallback } from 'react';
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
  const config = toastConfig[type];
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
        rounded-xl shadow-lg
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

// Toast Container
const ToastContainer = ({ toasts, removeToast }) => {
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2">
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

// Toast Provider
export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((type, message, duration = 4000) => {
    const id = Date.now() + Math.random();

    setToasts((prev) => [...prev, { id, type, message }]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }

    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = {
    success: (message, duration) => addToast('success', message, duration),
    error: (message, duration) => addToast('error', message, duration),
    warning: (message, duration) => addToast('warning', message, duration),
    info: (message, duration) => addToast('info', message, duration),
    dismiss: removeToast,
    dismissAll: () => setToasts([]),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
};

// Hook to use toast
export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export default ToastProvider;
