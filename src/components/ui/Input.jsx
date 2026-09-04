import { forwardRef, useId, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';

const sizes = {
  sm: 'px-3 py-1.5 text-sm rounded-[var(--radius-sm)]',
  md: 'px-4 py-2.5 text-base rounded-[var(--radius-sm)]',
  lg: 'px-5 py-3.5 text-lg rounded-[var(--radius-sm)]',
};

const Input = forwardRef(({
  label,
  type = 'text',
  placeholder,
  value,
  onChange,
  onBlur,
  onFocus,
  error,
  hint,
  disabled = false,
  required = false,
  leftIcon,
  rightIcon,
  suffix,
  prefix,
  size = 'md',
  fullWidth = true,
  className = '',
  inputClassName = '',
  id,
  name,
  autoComplete,
  min,
  max,
  step,
  maxLength,
  ...props
}, ref) => {
  const [showPassword, setShowPassword] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  // useId fallback — label ภาษาไทยซ้ำกันจะไม่ชน id กัน
  const reactId = useId();
  const inputId = id || name || reactId;
  const describedById = `${inputId}-description`;
  const isPassword = type === 'password';
  const inputType = isPassword && showPassword ? 'text' : type;

  const handleFocus = (e) => {
    setIsFocused(true);
    onFocus?.(e);
  };

  const handleBlur = (e) => {
    setIsFocused(false);
    onBlur?.(e);
  };

  return (
    <div className={`${fullWidth ? 'w-full' : ''} ${className}`}>
      {/* Label */}
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-semibold text-[var(--text-primary)] mb-1.5"
        >
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      {/* Input Container */}
      <div className="relative">
        {/* Prefix */}
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] text-sm">
            {prefix}
          </span>
        )}

        {/* Left Icon */}
        {leftIcon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
            {leftIcon}
          </span>
        )}

        {/* Input */}
        <input
          ref={ref}
          id={inputId}
          name={name}
          type={inputType}
          value={value}
          onChange={onChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete={autoComplete}
          min={min}
          max={max}
          step={step}
          maxLength={maxLength}
          aria-invalid={!!error}
          aria-describedby={error || hint ? describedById : undefined}
          className={`
            w-full
            bg-[var(--bg-tertiary)]
            border-2
            ${error
              ? 'border-[var(--state-danger)]'
              : isFocused
                ? 'border-[var(--accent-emerald)]'
                : 'border-[var(--border-color)]'
            }
            text-[var(--text-primary)]
            placeholder:text-[var(--text-muted)]
            transition-all duration-200
            focus:outline-none focus:ring-4 focus:ring-emerald-500/20
                disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-[var(--bg-tertiary)]
            ${sizes[size]}
            ${leftIcon || prefix ? 'pl-10' : ''}
            ${rightIcon || suffix || isPassword ? 'pr-10' : ''}
            ${inputClassName}
          `}
          {...props}
        />

        {/* Right Icon / Password Toggle / Suffix */}
        {(rightIcon || isPassword || suffix) && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {suffix && (
              <span className="text-[var(--text-secondary)] text-sm">{suffix}</span>
            )}
            {isPassword && (
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            )}
            {rightIcon && !isPassword && (
              <span className="text-[var(--text-muted)]">{rightIcon}</span>
            )}
          </span>
        )}
      </div>

      {/* Error / Hint */}
      <AnimatePresence>
        {(error || hint) && (
          <motion.div
            id={describedById}
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className={`mt-1.5 text-sm flex items-center gap-1 ${
              error ? 'text-[var(--state-danger)]' : 'text-[var(--text-secondary)]'
            }`}
          >
            {error && <AlertCircle size={14} />}
            {error || hint}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

Input.displayName = 'Input';

// Textarea variant
export const Textarea = forwardRef(({
  label,
  placeholder,
  value,
  onChange,
  error,
  hint,
  disabled = false,
  required = false,
  rows = 4,
  resize = 'vertical',
  size = 'md',
  fullWidth = true,
  className = '',
  id,
  ...props
}, ref) => {
  // useId fallback — label ภาษาไทยซ้ำกันจะไม่ชน id กัน
  const reactId = useId();
  const inputId = id || reactId;
  const describedById = `${inputId}-description`;

  const resizeClasses = {
    none: 'resize-none',
    vertical: 'resize-y',
    horizontal: 'resize-x',
    both: 'resize',
  };

  return (
    <div className={`${fullWidth ? 'w-full' : ''} ${className}`}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-semibold text-[var(--text-primary)] mb-1.5"
        >
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <textarea
        ref={ref}
        id={inputId}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        aria-invalid={!!error}
        aria-describedby={error || hint ? describedById : undefined}
        className={`
          w-full
          bg-[var(--bg-tertiary)]
          border-2
          ${error
            ? 'border-[var(--state-danger)]'
            : 'border-[var(--border-color)]'
          }
          text-[var(--text-primary)]
          placeholder:text-[var(--text-muted)]
          transition-all duration-200
          focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20
          disabled:opacity-50 disabled:cursor-not-allowed
          ${sizes[size]}
          ${resizeClasses[resize]}
        `}
        {...props}
      />

      <AnimatePresence>
        {(error || hint) && (
          <motion.div
            id={describedById}
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className={`mt-1.5 text-sm flex items-center gap-1 ${
              error ? 'text-[var(--state-danger)]' : 'text-[var(--text-secondary)]'
            }`}
          >
            {error && <AlertCircle size={14} />}
            {error || hint}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

Textarea.displayName = 'Textarea';

export default Input;
