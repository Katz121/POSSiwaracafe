import { useState, useEffect, useCallback, useId, forwardRef } from 'react';
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
  const titleId = useId();

  // Handle escape key
  const handleEscape = useCallback((e) => {
    if (e.key === 'Escape' && closeOnEscape) {
      onClose?.();
    }
  }, [onClose, closeOnEscape]);

  useEffect(() => {
    if (!isOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = prevOverflow;
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
          className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4"
          onClick={handleBackdropClick}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? titleId : undefined}
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[var(--z-modal-bg)] bg-black/60 backdrop-blur-sm"
          />

          {/* Modal Content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={`
              relative z-[var(--z-modal)] w-full ${sizes[size]}
              bg-[var(--bg-secondary)]
              rounded-[var(--radius)] shadow-[var(--elev-3)]
              max-h-[90vh] overflow-hidden
              flex flex-col
              ${className}
            `}
          >
            {/* Header */}
            {(title || showClose) && (
              <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b border-[var(--border-color)]">
                {title && (
                  <h2
                    id={titleId}
                    className="text-xl font-bold text-[var(--text-primary)]"
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
              <div className="flex items-center justify-end gap-2 md:gap-3 px-4 md:px-6 py-3 md:py-4 border-t border-[var(--border-color)] bg-[var(--bg-tertiary)]">
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
  className = '',
}) => {
  // Auto-select icon based on variant
  const iconMap = {
    danger: Trash2,
    warning: AlertTriangle,
    primary: CheckCircle2,
    info: Info,
  };
  const IconComponent = Icon || iconMap[variant] || AlertTriangle;

  // Button ไม่มี variant 'info' — map ไปใช้ 'primary' (icon ยังคงเป็น info)
  const buttonVariant = variant === 'info' ? 'primary' : variant;

  const iconBgColors = {
    danger: 'bg-[var(--bg-tertiary)] text-[var(--state-danger)]',
    warning: 'bg-[var(--bg-tertiary)] text-[var(--state-warn)]',
    primary: 'bg-[var(--bg-tertiary)] text-[var(--accent-emerald)]',
    info: 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]',
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      showClose={false}
      closeOnBackdrop={false}
      className={className}
    >
      <div className="text-center py-4">
        <div className={`w-20 h-20 rounded-[var(--radius-sm)] mx-auto flex items-center justify-center mb-6 shadow-inner ${iconBgColors[variant]}`}>
          <IconComponent size={40} />
        </div>
        <h3 className="font-bold text-2xl mb-3 tracking-tight text-[var(--text-primary)]">{title}</h3>
        <p className="text-[var(--text-secondary)] font-medium mb-8 text-sm px-4">
          {message}
        </p>
        <div className="grid grid-cols-2 gap-4">
          <Button variant="secondary" size="lg" onClick={onClose} disabled={loading}>
            {cancelText}
          </Button>
          <Button variant={buttonVariant} size="lg" onClick={onConfirm} loading={loading}>
            {confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

ConfirmModal.displayName = 'ConfirmModal';

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
  className = '',
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
    danger: 'bg-[var(--bg-tertiary)] text-[var(--state-danger)]',
    warning: 'bg-[var(--bg-tertiary)] text-[var(--state-warn)]',
    primary: 'bg-[var(--bg-tertiary)] text-[var(--accent-emerald)]',
    secondary: 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]',
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      showClose={false}
      closeOnBackdrop={false}
      className={className}
    >
      <form onSubmit={handleSubmit} className="py-2">
        <div className="text-center mb-6">
          <div className={`w-16 h-16 rounded-[var(--radius-sm)] mx-auto flex items-center justify-center mb-4 shadow-[var(--elev-1)] ${iconBgColors[variant]}`}>
            <IconComponent size={32} />
          </div>
          <h3 className="font-bold text-xl mb-1 tracking-tight text-[var(--text-primary)]">{title}</h3>
          {description && (
            <p className="text-[var(--text-muted)] font-medium text-sm">{description}</p>
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

InputModal.displayName = 'InputModal';

export default Modal;
