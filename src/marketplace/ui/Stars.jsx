import { Star } from 'lucide-react';

/**
 * Five stars, filled to `value`.
 *
 * Gold from the theme, not Tailwind's amber — the Appearance settings own the
 * accent colour, and a rating is the most-repeated piece of gold on the site.
 * Half stars are not drawn: the average is printed beside them wherever the
 * exact number matters, and half an SVG star is a lot of code for a distinction
 * nobody reads off a picture.
 *
 * No "use client" on purpose. It holds no state, so it renders on the server in
 * a page and gets bundled into whichever client component imports it.
 */
export default function Stars({ value = 0, size = 'h-4 w-4', className = '', label = null }) {
  const filled = Math.round(Number(value) || 0);

  return (
    <span
      className={`inline-flex items-center gap-0.5 ${className}`}
      aria-label={label ?? `${Number(value || 0).toFixed(1)} / 5`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden="true"
          className={`${size} ${
            n <= filled
              ? 'fill-[var(--gold)] text-[var(--gold)]'
              : 'fill-transparent text-gray-300 dark:text-gray-600'
          }`}
        />
      ))}
    </span>
  );
}
