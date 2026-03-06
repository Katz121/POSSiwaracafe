import { motion } from 'framer-motion';

const sizes = {
  xs: 'w-3 h-3',
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
  xl: 'w-12 h-12',
};

const colors = {
  emerald: 'text-emerald-500',
  white: 'text-white',
  gray: 'text-gray-400',
  current: 'text-current',
};

const Spinner = ({
  size = 'md',
  color = 'emerald',
  className = '',
  label = 'กำลังโหลด...'
}) => {
  return (
    <div className={`inline-flex items-center justify-center ${className}`} role="status" aria-label={label}>
      <motion.svg
        className={`animate-spin ${sizes[size]} ${colors[color]}`}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        initial={{ rotate: 0 }}
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </motion.svg>
      <span className="sr-only">{label}</span>
    </div>
  );
};

export default Spinner;
