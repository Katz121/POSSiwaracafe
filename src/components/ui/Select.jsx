import { forwardRef, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check, AlertCircle } from 'lucide-react';

const sizes = {
  sm: 'px-3 py-1.5 text-sm rounded-[var(--radius-sm)]',
  md: 'px-4 py-2.5 text-base rounded-[var(--radius-sm)]',
  lg: 'px-5 py-3.5 text-lg rounded-[var(--radius-sm)]',
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

  // Close on outside click — attach listener only while open
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

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
        <label className="block text-sm font-semibold text-[var(--text-primary)] mb-1.5">
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
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`
          w-full flex items-center justify-between gap-2
          bg-[var(--bg-tertiary)]
          border-2
          ${error
            ? 'border-[var(--state-danger)]'
            : isOpen
              ? 'border-[var(--accent-emerald)]'
              : 'border-[var(--border-color)]'
          }
          text-left
          transition-all duration-200
          focus:outline-none focus:ring-4 focus:ring-emerald-500/20
          disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-[var(--bg-tertiary)]
          ${sizes[size]}
        `}
      >
        <span className={selectedOption ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          size={18}
          className={`text-[var(--text-muted)] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
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
            className="absolute z-[var(--z-dropdown)] w-full mt-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-[var(--radius-sm)] shadow-[var(--elev-2)] overflow-hidden"
          >
            {/* Search Input */}
            {searchable && (
              <div className="p-2 border-b border-[var(--border-color)]">
                <input
                  ref={inputRef}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="ค้นหา..."
                  className="w-full px-3 py-2 text-sm bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-[var(--radius-sm)] focus:outline-none focus:border-[var(--accent-emerald)]"
                />
              </div>
            )}

            {/* Options */}
            <div className="max-h-60 overflow-y-auto">
              {filteredOptions.length === 0 ? (
                <div className="px-4 py-3 text-sm text-[var(--text-secondary)] text-center">
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
                        ? 'bg-[var(--bg-tertiary)] text-[var(--accent-emerald)]'
                        : 'hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                      }
                    `}
                  >
                    <div className="flex items-center gap-3">
                      {option.icon && <span>{option.icon}</span>}
                      <div>
                        <div className="font-medium">{option.label}</div>
                        {option.description && (
                          <div className="text-xs text-[var(--text-secondary)] mt-0.5">
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

Select.displayName = 'Select';

export default Select;
