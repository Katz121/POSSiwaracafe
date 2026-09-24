import { formatBaht } from '../../utils/format';

const SIZES = {
  xs: 'text-xs',
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
  '2xl': 'text-2xl',
  '3xl': 'text-3xl',
  display: 'text-[length:var(--fs-display)] leading-[var(--lh-display)]',
};

/**
 * Money · every baht amount on screen goes through this (tabular Inter digits,
 * 2-dp rounding, "฿38,312.28" not "฿38,312.276").
 *
 * Props: value, size ('xs'..'3xl' | 'display' | undefined = inherit),
 *        sign (prefix + on positives), muted, tone ('ok'|'warn'|'danger'),
 *        decimals (force), className, as ('span').
 */
export default function Money({
  value,
  size,
  sign = false,
  muted = false,
  tone,
  decimals,
  className = '',
  as: Tag = 'span',
  ...props
}) {
  const color = tone === 'ok'
    ? 'text-[var(--state-ok)]'
    : tone === 'warn'
      ? 'text-[var(--state-warn)]'
      : tone === 'danger'
        ? 'text-[var(--state-danger)]'
        : muted
          ? 'text-[var(--text-muted)]'
          : '';
  return (
    <Tag className={`num whitespace-nowrap ${size ? SIZES[size] || '' : ''} ${color} ${className}`} {...props}>
      {formatBaht(value, { sign, decimals })}
    </Tag>
  );
}
