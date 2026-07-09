import { forwardRef } from 'react';

const Divider = forwardRef(({
  orientation = 'horizontal',
  label,
  className = '',
  ...props
}, ref) => {
  if (orientation === 'vertical') {
    return (
      <div
        ref={ref}
        className={`
          w-px h-full
          bg-gray-200 dark:bg-gray-700
          ${className}
        `}
        {...props}
      />
    );
  }

  if (label) {
    return (
      <div ref={ref} className={`flex items-center gap-4 ${className}`} {...props}>
        <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
        <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">
          {label}
        </span>
        <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={`
        h-px w-full
        bg-gray-200 dark:bg-gray-700
        ${className}
      `}
      {...props}
    />
  );
});

Divider.displayName = 'Divider';

export default Divider;
