import { useState } from 'react';
import { User } from 'lucide-react';

const sizes = {
  xs: 'w-6 h-6 text-xs',
  sm: 'w-8 h-8 text-sm',
  md: 'w-10 h-10 text-base',
  lg: 'w-12 h-12 text-lg',
  xl: 'w-16 h-16 text-xl',
  '2xl': 'w-20 h-20 text-2xl',
};

const Avatar = ({
  src,
  alt,
  name,
  size = 'md',
  rounded = 'full',
  fallback,
  className = '',
  onClick,
}) => {
  const [error, setError] = useState(false);

  // Generate initials from name
  const getInitials = (name) => {
    if (!name) return '';
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  // Generate color from name
  const getColorFromName = (name) => {
    if (!name) return 'bg-gray-200 dark:bg-gray-700';

    const colors = [
      'bg-red-500',
      'bg-orange-500',
      'bg-amber-500',
      'bg-yellow-500',
      'bg-lime-500',
      'bg-green-500',
      'bg-emerald-500',
      'bg-teal-500',
      'bg-cyan-500',
      'bg-sky-500',
      'bg-blue-500',
      'bg-indigo-500',
      'bg-violet-500',
      'bg-purple-500',
      'bg-fuchsia-500',
      'bg-pink-500',
      'bg-rose-500',
    ];

    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const showImage = src && !error;
  const initials = getInitials(name);
  const bgColor = getColorFromName(name);

  return (
    <div
      onClick={onClick}
      className={`
        relative inline-flex items-center justify-center overflow-hidden
        rounded-${rounded}
        ${sizes[size]}
        ${onClick ? 'cursor-pointer' : ''}
        ${showImage ? 'bg-gray-200 dark:bg-gray-700' : bgColor}
        ${className}
      `}
    >
      {showImage ? (
        <img
          src={src}
          alt={alt || name}
          onError={() => setError(true)}
          className="w-full h-full object-cover"
        />
      ) : initials ? (
        <span className="font-semibold text-white select-none">
          {initials}
        </span>
      ) : fallback ? (
        fallback
      ) : (
        <User className="w-1/2 h-1/2 text-gray-400 dark:text-gray-500" />
      )}
    </div>
  );
};

// Avatar Group
export const AvatarGroup = ({
  children,
  max = 4,
  size = 'md',
  className = '',
}) => {
  const childArray = Array.isArray(children) ? children : [children];
  const visibleCount = Math.min(childArray.length, max);
  const remainingCount = childArray.length - max;

  return (
    <div className={`flex -space-x-2 ${className}`}>
      {childArray.slice(0, visibleCount).map((child, index) => (
        <div
          key={index}
          className="relative ring-2 ring-white dark:ring-gray-900 rounded-full"
          style={{ zIndex: visibleCount - index }}
        >
          {child}
        </div>
      ))}
      {remainingCount > 0 && (
        <div
          className={`
            relative inline-flex items-center justify-center
            ${sizes[size]}
            rounded-full
            bg-gray-200 dark:bg-gray-700
            text-gray-600 dark:text-gray-300
            font-medium
            ring-2 ring-white dark:ring-gray-900
          `}
        >
          +{remainingCount}
        </div>
      )}
    </div>
  );
};

export default Avatar;
