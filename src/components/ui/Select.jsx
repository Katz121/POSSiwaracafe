import { forwardRef, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check, AlertCircle } from 'lucide-react';

const sizes = {
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-4 py-2.5 text-base rounded-xl',
  lg: 'px-5 py-3.5 text-lg rounded-xl',
};

const Select = forwardRef(({
  label,
  options = [],
  value,
  onChange,
  placeholder = 'เลือก...',
  error,
  hint,
  disabled = false,
  required = false,
  size = 'md',
  fullWidth = true,
  className = '',
  searchable = false,
}, ref) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const selectedOption = options.find(opt => opt.value === value);

  // Filter options based on search
  const filteredOptions = searchable
    ? options.filter(opt =>
        opt.label.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : options;

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && searchable && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, searchable]);

  const handleSelect = (option) => {
    onChange?.(option.value);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setSearchTerm('');
    }
    if (e.key === 'Enter' && !isOpen) {
      setIsOpen(true);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative ${fullWidth ? 'w-full' : ''} ${className}`}
    >
      {/* Label */}
      {label && (
        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      {/* Trigger */}
      <button
        ref={ref}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={`
          w-full flex items-center justify-between gap-2
          bg-gray-50 dark:bg-gray-900
          border-2
          ${error
            ? 'border-red-400 dark:border-red-500'
            : isOpen
              ? 'border-emerald-500 dark:border-emerald-400'
              : 'border-gray-200 dark:border-gray-700'
          }
          text-left
          transition-all duration-200
          focus:outline-none focus:ring-4 focus:ring-emerald-500/20
          disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-800
          ${sizes[size]}
        `}
      >
        <span className={selectedOption ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          size={18}
          className={`text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 w-full mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden"
          >
            {/* Search Input */}
            {searchable && (
              <div className="p-2 border-b border-gray-200 dark:border-gray-700">
                <input
                  ref={inputRef}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="ค้นหา..."
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-emerald-500"
                />
              </div>
            )}

            {/* Options */}
            <div className="max-h-60 overflow-y-auto">
              {filteredOptions.length === 0 ? (
                <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 text-center">
                  ไม่พบตัวเลือก
                </div>
              ) : (
                filteredOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleSelect(option)}
                    className={`
                      w-full flex items-center justify-between gap-2 px-4 py-3 text-left
                      transition-colors duration-150
                      ${option.value === value
                        ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200'
                      }
                    `}
                  >
                    <div className="flex items-center gap-3">
                      {option.icon && <span>{option.icon}</span>}
                      <div>
                        <div className="font-medium">{option.label}</div>
                        {option.description && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {option.description}
                          </div>
                        )}
                      </div>
                    </div>
                    {option.value === value && (
                      <Check size={18} className="text-emerald-500 flex-shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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

Select.displayName = 'Select';

export default Select;
