// UI Component Library (UX v2 · WP0 foundation)
// Packages consume these and never fork them. APIs are documented at the top
// of each file; a live gallery is at `#/__ui` in dev builds.

// Core
export { default as Button } from './Button';
export { default as IconButton } from './IconButton';
export { default as Card, SectionCard } from './Card';
export { default as Modal, ConfirmModal, InputModal } from './Modal';
export { default as Sheet } from './Sheet';

// Layout / page structure
export { default as PageHeader } from './PageHeader';
export { default as Toolbar } from './Toolbar';
export { default as Divider } from './Divider';
export { default as EmptyState } from './EmptyState';
export { default as ListRow } from './ListRow';

// Form / input
export { default as Input, Textarea } from './Input';
export { default as Select } from './Select';
export { default as SearchSelect } from './SearchSelect';
export { default as SegmentedControl } from './SegmentedControl';
export { default as FilterChips } from './FilterChips';
export { default as DateStepper } from './DateStepper';
export { default as NumberStepper } from './NumberStepper';
export { default as StockUsageInput } from './StockUsageInput';

// Feedback
export { default as Spinner } from './Spinner';
export { default as Skeleton } from './Skeleton';
export { ToastProvider, useToast } from './Toast';
export { default as Badge, StatusBadge, CountBadge } from './Badge';
export { default as Banner } from './Banner';

// Data display
export { default as Money } from './Money';
export { default as StatCard } from './StatCard';
export { default as DataTable } from './DataTable';
export { default as Table } from './Table';
export { default as Tabs } from './Tabs';
export { default as Avatar, AvatarGroup } from './Avatar';

// Hooks
export { default as useMediaQuery } from './useMediaQuery';

// Error handling
export { default as ErrorBoundary } from './ErrorBoundary';
