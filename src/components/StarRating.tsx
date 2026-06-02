import { Star } from 'lucide-react';

interface StarRatingProps {
  value: number;
  count?: number;
  size?: number;
  interactive?: boolean;
  onChange?: (stars: number) => void;
  showCount?: boolean;
  className?: string;
}

// Single component for both display (read-only avg shown with halves rounded to
// nearest int) and input (1–5 click-to-set). Half-star display rendered via a
// clipped overlay so we don't need separate "half" icons.
export default function StarRating({
  value,
  count,
  size = 16,
  interactive = false,
  onChange,
  showCount = false,
  className = '',
}: StarRatingProps) {
  const stars = [1, 2, 3, 4, 5];
  const clamped = Math.max(0, Math.min(5, value));

  return (
    <div className={`inline-flex items-center gap-1 ${className}`} data-testid="star-rating">
      <div className="inline-flex items-center">
        {stars.map((star) => {
          const filled = interactive ? star <= clamped : star <= Math.round(clamped);
          const Component = interactive ? 'button' : 'span';
          const props = interactive
            ? {
                type: 'button' as const,
                onClick: () => onChange?.(star),
                'aria-label': `${star} 星`,
                'data-testid': `star-${star}`,
                className: 'transition-transform hover:scale-110 focus:outline-none',
              }
            : {};
          return (
            <Component key={star} {...props}>
              <Star
                size={size}
                className={filled ? 'fill-amber-400 text-amber-400' : 'text-petal-muted/40'}
              />
            </Component>
          );
        })}
      </div>
      {showCount && (
        <span className="text-xs text-petal-muted" data-testid="star-count">
          {clamped > 0 ? clamped.toFixed(1) : '—'}
          {typeof count === 'number' && ` (${count})`}
        </span>
      )}
    </div>
  );
}
