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
          bg-[var(--border-color)]
          ${className}
        `}
        {...props}
      />
    );
  }

  if (label) {
    return (
      <div ref={ref} className={`flex items-center gap-4 ${className}`} {...props}>
        <div className="flex-1 h-px bg-[var(--border-color)]" />
        <span className="text-sm text-[var(--text-secondary)] font-medium">
          {label}
        </span>
        <div className="flex-1 h-px bg-[var(--border-color)]" />
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={`
        h-px w-full
        bg-[var(--border-color)]
        ${className}
      `}
      {...props}
    />
  );
});

Divider.displayName = 'Divider';

export default Divider;
