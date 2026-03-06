import { forwardRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';

const sizes = {
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-4 py-2.5 text-base rounded-xl',
  lg: 'px-5 py-3.5 text-lg rounded-xl',
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

  const inputId = id || name || label?.toLowerCase().replace(/\s/g, '-');
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
          className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5"
        >
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      {/* Input Container */}
      <div className="relative">
        {/* Prefix */}
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 text-sm">
            {prefix}
          </span>
        )}

        {/* Left Icon */}
        {leftIcon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
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
          className={`
            w-full
            bg-gray-50 dark:bg-gray-900
            border-2
            ${error
              ? 'border-red-400 dark:border-red-500'
              : isFocused
                ? 'border-emerald-500 dark:border-emerald-400'
                : 'border-gray-200 dark:border-gray-700'
            }
            text-gray-900 dark:text-white
            placeholder-gray-400 dark:placeholder-gray-500
            transition-all duration-200
            focus:outline-none focus:ring-4 focus:ring-emerald-500/20
            disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-800
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
              <span className="text-gray-500 dark:text-gray-400 text-sm">{suffix}</span>
            )}
            {isPassword && (
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            )}
            {rightIcon && !isPassword && (
              <span className="text-gray-400">{rightIcon}</span>
            )}
          </span>
        )}
      </div>

      {/* Error / Hint */}
      <AnimatePresence>
        {(error || hint) && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className={`mt-1.5 text-sm flex items-center gap-1 ${
              error ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'
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
  ...props
}, ref) => {
  const inputId = label?.toLowerCase().replace(/\s/g, '-');

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
          className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5"
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
        className={`
          w-full
          bg-gray-50 dark:bg-gray-900
          border-2 border-gray-200 dark:border-gray-700
          text-gray-900 dark:text-white
          placeholder-gray-400 dark:placeholder-gray-500
          transition-all duration-200
          focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20
          disabled:opacity-50 disabled:cursor-not-allowed
          ${sizes[size]}
          ${resizeClasses[resize]}
          ${error ? 'border-red-400' : ''}
        `}
        {...props}
      />

      <AnimatePresence>
        {(error || hint) && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className={`mt-1.5 text-sm flex items-center gap-1 ${
              error ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'
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
