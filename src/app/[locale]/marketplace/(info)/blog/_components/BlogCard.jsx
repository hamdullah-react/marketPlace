import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, ArrowRight, Calendar, PenLine } from 'lucide-react';
import { pickText, formatDate } from '../_lib/text';

/**
 * One article, as a card. The blog list and "Read next" both render this.
 *
 * ── Why it is a component and not markup in two places ──────────────────────
 *
 * It was written twice, and the two immediately drifted: the list grew tags, a
 * description and a hover lift while the related strip kept a title and a date
 * in a different size. Two cards for one thing is not a style choice, it is a
 * bug that nobody reports because each half looks deliberate on its own.
 *
 * ── The sizes come from ListingCard ─────────────────────────────────────────
 *
 * Every type size here is the one the car card uses — its three-step ramp: a
 * base for the two-up phone layout, then sm, then md. A blog card and a car
 * card sit on the same phone, and choosing this one's sizes independently is
 * exactly what made them look like two different products.
 *
 * ── A server component ──────────────────────────────────────────────────────
 *
 * No state, no handlers: a link, a picture and some text. It ships no
 * JavaScript, which on a grid of twenty-four is the difference worth having.
 */
export default function BlogCard({
  post,
  locale = 'ar',
  base,
  /* Settings → Language decides whether a title missing in the reader's
     language falls back to the other one or is simply blank. The CALLER reads
     that setting, because it has already loaded site settings and this must
     not fetch them once per card. */
  fallback = false,
  /* The cards above the fold. priority implies eager and fetchPriority=high,
     so a caller that sets it should not also set loading. */
  priority = false,
  /* The truth about the layout this card is being placed into — half a phone
     in both grids, a third of the column on a desktop list, a narrower one in
     the related strip. Without it a browser assumes full width and fetches an
     image several times the area it will draw. */
  sizes = '(max-width: 640px) 50vw, (max-width: 1024px) 45vw, 380px',
}) {
  const isAr = locale === 'ar';
  const Arrow = isAr ? ArrowLeft : ArrowRight;

  const text = (value) => pickText(value, locale, fallback);

  const title = text(post.title) || post.slug;
  const excerpt = text(post.excerpt);
  const picture = post.cover_url || post.banner_url;

  return (
    <Link
      href={`${base}/${post.slug}`}
      prefetch={false}
      className="raised-card group relative flex h-full flex-col overflow-hidden rounded-2xl transition-transform duration-500 hover:-translate-y-1 sm:rounded-[22px] md:rounded-[26px]"
    >
      <span className="relative block aspect-[1200/630] w-full overflow-hidden bg-brand-primary/5">
        {/* The cover is the card's picture; the banner stands in when there is
            no cover. The pair falls back BOTH ways — the article hero prefers
            the banner and takes the cover when there is none — so filling in
            either one is enough and neither page is left with a blank.

            next/image, like the carousel: AVIF and WebP generated per width
            from the one file an admin uploaded. */}
        {picture ? (
          <Image
            src={picture}
            alt=""
            fill
            sizes={sizes}
            priority={priority}
            loading={priority ? undefined : 'lazy'}
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center">
            <PenLine className="h-5 w-5 text-brand-primary/20 sm:h-7 sm:w-7" />
          </span>
        )}
      </span>

      <span className="flex flex-1 flex-col px-2.5 pb-2.5 pt-2 sm:px-4 sm:pb-4 sm:pt-3 md:px-5">
        {/* ListingCard's badge scale: text-[7px] / [9px] / [10px]. The second
            chip waits for room rather than wrapping onto its own line, which at
            two columns is a third of the card's height. */}
        {post.tags?.length ? (
          <span className="mb-1 flex min-w-0 flex-wrap gap-1 sm:mb-1.5">
            {post.tags.slice(0, 2).map((tag, n) => (
              <span
                key={tag}
                className={`truncate rounded-full bg-brand-primary/10 px-1.5 py-px text-[7px] font-bold text-brand-primary sm:px-2 sm:py-0.5 sm:text-[9px] md:text-[10px] ${
                  n > 0 ? 'hidden sm:inline-block' : ''
                }`}
              >
                {tag}
              </span>
            ))}
          </span>
        ) : null}

        {/* The car's NAME line, one step up — a headline is the whole content
            of a blog card where a car card also carries a price. */}
        <span className="line-clamp-2 text-[10px] font-bold leading-snug tracking-tight text-neutral-900 transition-colors duration-300 group-hover:text-brand-primary dark:text-neutral-50 dark:group-hover:text-white sm:text-[12px] md:text-[13px]">
          {title}
        </span>

        {/* ListingCard's secondary line, shown at EVERY size including two-up
            on a phone: a title alone does not say what an article is about. */}
        {excerpt ? (
          <span className="mt-0.5 line-clamp-2 text-[7px] leading-relaxed text-gray-500 dark:text-gray-400 sm:mt-1 sm:text-[9px] md:text-[10px]">
            {excerpt}
          </span>
        ) : null}

        <span className="mt-auto flex items-center gap-1.5 pt-1.5 text-[7px] text-gray-500 dark:text-gray-400 sm:gap-2 sm:pt-2 sm:text-[9px] md:text-[10px]">
          {post.published_at ? (
            <span className="inline-flex min-w-0 items-center gap-1">
              <Calendar className="h-2.5 w-2.5 shrink-0 sm:h-3 sm:w-3" />
              <time dateTime={post.published_at} className="truncate">
                {formatDate(post.published_at, locale)}
              </time>
            </span>
          ) : null}

          {/* The byline is the first thing to go: the date is what a reader
              scans a list of articles by. */}
          {post.author ? <span className="hidden truncate sm:inline">{post.author}</span> : null}

          <Arrow className="ms-auto h-2.5 w-2.5 shrink-0 text-brand-primary transition-transform duration-300 group-hover:translate-x-0.5 sm:h-3 sm:w-3 rtl:group-hover:-translate-x-0.5" />
        </span>
      </span>
    </Link>
  );
}
