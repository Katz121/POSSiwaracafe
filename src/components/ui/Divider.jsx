const Divider = ({
  orientation = 'horizontal',
  label,
  className = '',
}) => {
  if (orientation === 'vertical') {
    return (
      <div
        className={`
          w-px h-full
          bg-gray-200 dark:bg-gray-700
          ${className}
        `}
      />
    );
  }

  if (label) {
    return (
      <div className={`flex items-center gap-4 ${className}`}>
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
      className={`
        h-px w-full
        bg-gray-200 dark:bg-gray-700
        ${className}
      `}
    />
  );
};

export default Divider;
