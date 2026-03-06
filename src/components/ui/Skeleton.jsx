import { motion } from 'framer-motion';

const shimmer = {
  initial: { x: '-100%' },
  animate: { x: '100%' },
  transition: {
    repeat: Infinity,
    duration: 1.5,
    ease: 'linear',
  },
};

// Base Skeleton
const Skeleton = ({
  width,
  height,
  rounded = 'lg',
  className = '',
  animate = true,
}) => {
  return (
    <div
      className={`
        relative overflow-hidden
        bg-gray-200 dark:bg-gray-700
        rounded-${rounded}
        ${className}
      `}
      style={{ width, height }}
    >
      {animate && (
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 dark:via-white/10 to-transparent"
          {...shimmer}
        />
      )}
    </div>
  );
};

// Text Skeleton
Skeleton.Text = ({ lines = 1, className = '' }) => {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height="1rem"
          rounded="md"
          className={i === lines - 1 ? 'w-3/4' : 'w-full'}
        />
      ))}
    </div>
  );
};

// Avatar Skeleton
Skeleton.Avatar = ({ size = 'md' }) => {
  const sizes = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  };

  return <Skeleton rounded="full" className={sizes[size]} />;
};

// Card Skeleton
Skeleton.Card = ({ className = '' }) => {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl p-4 space-y-4 ${className}`}>
      <div className="flex items-center gap-3">
        <Skeleton.Avatar />
        <div className="flex-1 space-y-2">
          <Skeleton height="0.875rem" className="w-1/3" rounded="md" />
          <Skeleton height="0.75rem" className="w-1/2" rounded="md" />
        </div>
      </div>
      <Skeleton.Text lines={3} />
      <div className="flex gap-2">
        <Skeleton height="2rem" className="w-20" rounded="lg" />
        <Skeleton height="2rem" className="w-20" rounded="lg" />
      </div>
    </div>
  );
};

// Table Skeleton
Skeleton.Table = ({ rows = 5, cols = 4, className = '' }) => {
  return (
    <div className={`space-y-3 ${className}`}>
      {/* Header */}
      <div className="flex gap-4 pb-3 border-b border-gray-200 dark:border-gray-700">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} height="1rem" className="flex-1" rounded="md" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 py-2">
          {Array.from({ length: cols }).map((_, colIndex) => (
            <Skeleton
              key={colIndex}
              height="1rem"
              className={`flex-1 ${colIndex === 0 ? 'w-2/3' : ''}`}
              rounded="md"
            />
          ))}
        </div>
      ))}
    </div>
  );
};

// Menu Item Skeleton (for POS)
Skeleton.MenuItem = ({ className = '' }) => {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl p-3 space-y-3 ${className}`}>
      <Skeleton height="120px" rounded="xl" />
      <Skeleton height="1rem" className="w-2/3" rounded="md" />
      <Skeleton height="1.25rem" className="w-1/3" rounded="md" />
    </div>
  );
};

// Menu Grid Skeleton
Skeleton.MenuGrid = ({ items = 6, className = '' }) => {
  return (
    <div className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 ${className}`}>
      {Array.from({ length: items }).map((_, i) => (
        <Skeleton.MenuItem key={i} />
      ))}
    </div>
  );
};

// Stats Card Skeleton
Skeleton.Stats = ({ className = '' }) => {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl p-4 space-y-3 ${className}`}>
      <Skeleton height="0.75rem" className="w-1/3" rounded="md" />
      <Skeleton height="2rem" className="w-2/3" rounded="md" />
      <Skeleton height="0.625rem" className="w-1/2" rounded="md" />
    </div>
  );
};

// Order Card Skeleton
Skeleton.OrderCard = ({ className = '' }) => {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl p-4 space-y-3 ${className}`}>
      <div className="flex justify-between items-center">
        <Skeleton height="1.5rem" className="w-16" rounded="lg" />
        <Skeleton height="1.25rem" className="w-20" rounded="full" />
      </div>
      <div className="space-y-2">
        <Skeleton height="0.875rem" className="w-full" rounded="md" />
        <Skeleton height="0.875rem" className="w-3/4" rounded="md" />
      </div>
      <div className="flex justify-between items-center pt-2">
        <Skeleton height="1rem" className="w-24" rounded="md" />
        <Skeleton height="1.25rem" className="w-16" rounded="md" />
      </div>
    </div>
  );
};

export default Skeleton;
