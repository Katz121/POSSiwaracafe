import { useState, useEffect, useCallback, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, Trash2, CheckCircle2, Info, Edit as EditIcon } from 'lucide-react';
import IconButton from './IconButton';
import Button from './Button';
import Input from './Input';

const sizes = {
  sm: 'max-w-[95vw] md:max-w-sm',
  md: 'max-w-[95vw] md:max-w-md',
  lg: 'max-w-[95vw] md:max-w-lg',
  xl: 'max-w-[95vw] md:max-w-xl',
  '2xl': 'max-w-[95vw] md:max-w-2xl',
  '3xl': 'max-w-[95vw] md:max-w-3xl',
  '4xl': 'max-w-[95vw] md:max-w-4xl',
  full: 'max-w-[98vw] md:max-w-[95vw] lg:max-w-[90vw]',
};

const Modal = forwardRef(({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showClose = true,
  closeOnBackdrop = true,
  closeOnEscape = true,
  className = '',
  bodyClassName = '',
  footer,
}, ref) => {
  // Handle escape key
  const handleEscape = useCallback((e) => {
    if (e.key === 'Escape' && closeOnEscape) {
      onClose?.();
    }
  }, [onClose, closeOnEscape]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, handleEscape]);

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && closeOnBackdrop) {
      onClose?.();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={ref}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[300] flex items-center justify-center p-4"
          onClick={handleBackdropClick}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? 'modal-title' : undefined}
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal Content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={`
              relative w-full ${sizes[size]}
              bg-white dark:bg-gray-800
              rounded-3xl shadow-2xl
              max-h-[90vh] overflow-hidden
              flex flex-col
              ${className}
            `}
          >
            {/* Header */}
            {(title || showClose) && (
              <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b border-gray-200 dark:border-gray-700">
                {title && (
                  <h2
                    id="modal-title"
                    className="text-xl font-bold text-gray-900 dark:text-white"
                  >
                    {title}
                  </h2>
                )}
                {showClose && (
                  <IconButton
                    icon={<X size={20} />}
                    variant="ghost"
                    size="sm"
                    onClick={onClose}
                    aria-label="ปิด"
                    className="ml-auto"
                  />
                )}
              </div>
            )}

            {/* Body */}
            <div className={`flex-1 overflow-y-auto px-4 md:px-6 py-3 md:py-4 ${bodyClassName}`}>
              {children}
            </div>

            {/* Footer */}
            {footer && (
              <div className="flex items-center justify-end gap-2 md:gap-3 px-4 md:px-6 py-3 md:py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

Modal.displayName = 'Modal';

// Confirmation Modal Variant - สวยกว่า window.confirm()
export const ConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'ยืนยันการดำเนินการ',
  message,
  confirmText = 'ยืนยัน',
  cancelText = 'ยกเลิก',
  variant = 'danger',
  icon: Icon,
  loading = false,
}) => {
  // Auto-select icon based on variant
  const iconMap = {
    danger: Trash2,
    warning: AlertTriangle,
    primary: CheckCircle2,
    info: Info,
  };
  const IconComponent = Icon || iconMap[variant] || AlertTriangle;

  const iconBgColors = {
    danger: 'bg-red-50 dark:bg-red-900/30 text-red-500',
    warning: 'bg-orange-50 dark:bg-orange-900/30 text-orange-500',
    primary: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-500',
    info: 'bg-blue-50 dark:bg-blue-900/30 text-blue-500',
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      showClose={false}
      closeOnBackdrop={false}
    >
      <div className="text-center py-4">
        <div className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center mb-6 shadow-inner ${iconBgColors[variant]}`}>
          <IconComponent size={40} />
        </div>
        <h3 className="font-black text-2xl mb-3 tracking-tight uppercase text-gray-800 dark:text-white">{title}</h3>
        <p className="text-gray-500 dark:text-gray-400 font-medium mb-8 text-sm px-4">
          {message}
        </p>
        <div className="grid grid-cols-2 gap-4">
          <Button variant="secondary" size="lg" onClick={onClose} disabled={loading}>
            {cancelText}
          </Button>
          <Button variant={variant} size="lg" onClick={onConfirm} loading={loading}>
            {confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

// Input Modal Variant - สวยกว่า window.prompt()
export const InputModal = ({
  isOpen,
  onClose,
  onSubmit,
  title = 'กรอกข้อมูล',
  description,
  fields = [], // Array of { name, label, type, placeholder, required, defaultValue }
  submitText = 'ตกลง',
  cancelText = 'ยกเลิก',
  variant = 'primary',
  icon: Icon,
  loading = false,
}) => {
  const IconComponent = Icon || EditIcon;

  // Initialize form data
  const [formData, setFormData] = useState({});

  // Reset form when modal opens - use JSON.stringify to avoid infinite loops
  const fieldsKey = JSON.stringify(fields.map(f => ({ name: f.name, defaultValue: f.defaultValue })));
  useEffect(() => {
    if (isOpen) {
      const initial = {};
      fields.forEach(f => {
        initial[f.name] = f.defaultValue || '';
      });
      setFormData(initial);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, fieldsKey]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit?.(formData);
  };

  const handleChange = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const iconBgColors = {
    danger: 'bg-red-50 dark:bg-red-900/30 text-red-500',
    warning: 'bg-orange-50 dark:bg-orange-900/30 text-orange-500',
    primary: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-500',
    secondary: 'bg-blue-50 dark:bg-blue-900/30 text-blue-500',
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      showClose={false}
      closeOnBackdrop={false}
    >
      <form onSubmit={handleSubmit} className="py-2">
        <div className="text-center mb-6">
          <div className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg ${iconBgColors[variant]}`}>
            <IconComponent size={32} />
          </div>
          <h3 className="font-black text-xl mb-1 tracking-tight uppercase text-gray-800 dark:text-white">{title}</h3>
          {description && (
            <p className="text-gray-400 font-medium text-sm">{description}</p>
          )}
        </div>

        <div className="space-y-4 mb-6">
          {fields.map((field) => (
            <Input
              key={field.name}
              type={field.type || 'text'}
              label={field.label}
              placeholder={field.placeholder}
              required={field.required}
              value={formData[field.name] || ''}
              onChange={(e) => handleChange(field.name, e.target.value)}
              autoFocus={fields.indexOf(field) === 0}
            />
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Button type="button" variant="secondary" size="lg" onClick={onClose} disabled={loading}>
            {cancelText}
          </Button>
          <Button type="submit" variant={variant} size="lg" loading={loading}>
            {submitText}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default Modal;
