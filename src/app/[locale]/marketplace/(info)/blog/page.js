import Link from 'next/link';
import Image from 'next/image';
import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { ArrowLeft, ArrowRight, Calendar, PenLine, Tag } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import BlogCard from './_components/BlogCard';
import JsonLd from './_components/JsonLd';
import { getBlogBanner, listBlogPosts, listBlogTags } from '@/marketplace/db/queries/blog';
import { getSiteSettings } from '@/marketplace/db/queries/site';
import { pageMetadata, resolvePageSeo } from '@/marketplace/seo/pageMetadata';
import { SITE_URL } from '@/marketplace/lib/sitePages';
import { pickText, formatDate } from './_lib/text';

/** Managed on Admin → Website content → Pages SEO. */
export async function generateMetadata({ params }) {
  const { locale } = await params;
  return pageMetadata('blog', locale);
}

/**
 * The blog.
 *
 * ── Why the list is its own request, behind Suspense ────────────────────────
 *
 * The heading and the shell around it are the same for everybody and can be
 * prerendered; the articles change whenever somebody publishes one. Splitting
 * them means a reader sees the page immediately and the list fills in, instead
 * of waiting on the database for the whole thing.
 *
 * ── Tags are links, not a filter widget ────────────────────────────────────
 *
 * /blog?tag=buying-guide is a real URL: it can be shared, indexed and linked
 * from an article. A client-side filter would have been less code and would
 * have made every one of those impossible.
 */
export default async function BlogPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const isAr = locale === 'ar';
  const t = (ar, en) => (isAr ? ar : en);

  return (
    <div>
      {/* Its own boundary, with the built-in heading as the fallback: the words
          a reader sees first must not wait on a database, and if the banner read
          is slow or the table is missing the page still opens on a heading
          rather than on a gap. */}
      <Suspense fallback={<DefaultHeader t={t} />}>
        <Banner locale={locale} t={t} isAr={isAr} />
      </Suspense>

      <div className="mx-auto w-full max-w-6xl px-4 pb-14 sm:px-6">
        <Suspense fallback={<ListSkeleton />}>
          <Articles locale={locale} t={t} isAr={isAr} searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

/**
 * The banner an admin manages, or the built-in heading.
 *
 * With a picture it is a hero: the image behind, a scrim over it so the words
 * stay readable whatever was uploaded, and the text on top. Without one it is
 * the same words on the page's own background — the layout does not change
 * shape, so switching the picture off never rearranges the page underneath.
 */
async function Banner({ locale, t, isAr }) {
  const [banner, site] = await Promise.all([getBlogBanner(), getSiteSettings()]);
  if (!banner) return <DefaultHeader t={t} />;

  const text = (value) => pickText(value, locale, site.localeFallback);

  const heading =
    text(banner.heading) ||
    t('نصائح وأدلة لشراء وبيع السيارات', 'Guides and advice on buying and selling cars');
  const subheading = text(banner.subheading);
  const ctaLabel = text(banner.cta_label);
  const href = banner.cta_href;
  const Arrow = isAr ? ArrowLeft : ArrowRight;

  /* A path from the admin is site-relative and needs the locale; a full URL is
     left exactly as typed. */
  const target =
    href && href.startsWith('/') ? `/${locale}/marketplace${href}` : href;

  if (!banner.image_url) {
    return (
      <HeaderShell>
        <Eyebrow t={t} />
        <h1 className="mt-3 text-3xl font-bold text-brand-primary sm:text-4xl">{heading}</h1>
        {subheading ? <p className="mt-3 text-base text-muted-foreground">{subheading}</p> : null}
        {target && ctaLabel ? (
          <Cta href={target} label={ctaLabel} Arrow={Arrow} />
        ) : null}
      </HeaderShell>
    );
  }

  /* ── Built like the home carousel, deliberately ──────────────────────────
     Same shape as the hero on the home page: full-bleed photograph, a scrim
     over it, the words on top, bottom-aligned, and the text held to the same
     1600px column with the same padding scale. A banner that is full width on
     one page and boxed on the next reads as two different sites.

     The HEIGHT comes from the minimums rather than from the image's aspect
     ratio, so an admin uploading a tall photograph or a wide one gets the same
     band and the layout cannot shift when it loads — the argument the home
     hero makes at length. Slightly shorter than the home one, which has to fit
     a filter bar inside it and this does not. */
  return (
    <section className="relative isolate flex min-h-[240px] flex-col justify-end overflow-hidden bg-neutral-900 sm:min-h-[360px] lg:min-h-[460px]">
          {/* next/image, exactly as the home carousel does it.
              ── What it buys over a bare <img> ─────────────────────────────
              AVIF and WebP generated per width from the one file an admin
              uploaded. On a photograph this wide that is usually the difference
              between ~300KB and ~60KB, and it is the single biggest thing
              available on this screen.

              `fill` rather than width/height: the band is a full-bleed box of
              unknown aspect ratio, and fill + object-cover is how next/image
              expresses that. It needs a positioned ancestor, which the section
              provides.

              `sizes="100vw"` is the truth here, and is what stops a phone
              downloading the desktop rendition.

              `priority` because this is the LCP element on the page — it
              implies eager and fetchPriority=high, so saying those too would be
              saying it twice. */}
      <Image
        src={banner.image_url}
        alt={text(banner.alt)}
        fill
        sizes="100vw"
        priority
        className="object-cover"
      />

      {/* The scrim is not decoration. An admin uploads whatever photograph they
          have, and white text over an unknown one is unreadable often enough
          that the wash has to be unconditional. Deeper at the foot than in the
          middle, because that is where the words sit and the picture deserves
          the clearest band of the frame. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10 bg-linear-to-b from-black/35 via-black/25 to-black/70"
      />

      <div className="relative z-20 mx-auto w-full max-w-[1600px] px-4 pb-7 pt-12 sm:px-8 sm:pb-12 sm:pt-16 lg:px-20 xl:px-28">
        <div className="max-w-3xl">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
            <PenLine className="h-3.5 w-3.5" />
            {t('المدونة', 'Blog')}
          </p>
          {/* Four steps rather than a jump from 30px straight to 48px: on a
              phone a long Arabic heading at text-3xl runs to four lines and
              pushes the CTA out of the band. */}
          <h1 className="mt-2.5 text-2xl font-bold leading-tight text-white drop-shadow-sm sm:mt-3 sm:text-3xl md:text-4xl lg:text-5xl">
            {heading}
          </h1>
          {subheading ? (
            /* Clamped on a phone. A subheading is a second line of promise, not
               a paragraph, and an admin who writes 300 characters must not be
               able to bury the button underneath it. */
            <p className="mt-2 line-clamp-3 max-w-2xl text-sm text-white/85 drop-shadow-sm sm:mt-3 sm:line-clamp-none sm:text-base lg:text-lg">
              {subheading}
            </p>
          ) : null}
          {target && ctaLabel ? (
            <Link
              href={target}
              /* Full width on a phone, where a 44px-tall target that spans the
                 column is easier to hit than one sized to its own text. */
              className="mt-5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-brand-primary transition-colors hover:bg-white/90 sm:mt-6 sm:w-auto sm:justify-start"
            >
              {ctaLabel}
              <Arrow className="h-4 w-4" />
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function HeaderShell({ children }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-10 sm:px-6 lg:pt-14">
      <header className="max-w-3xl">{children}</header>
    </div>
  );
}

function Eyebrow({ t }) {
  return (
    <p className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary/10 px-3 py-1 text-xs font-medium text-brand-primary">
      <PenLine className="h-3.5 w-3.5" />
      {t('المدونة', 'Blog')}
    </p>
  );
}

function Cta({ href, label, Arrow }) {
  return (
    <Link
      href={href}
      className="raised-solid mt-6 inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white"
    >
      {label}
      <Arrow className="h-4 w-4" />
    </Link>
  );
}

/** What the page says when no banner has been set up, and while one loads. */
function DefaultHeader({ t }) {
  return (
    <HeaderShell>
      <Eyebrow t={t} />
      <h1 className="mt-3 text-3xl font-bold text-brand-primary sm:text-4xl">
        {t('نصائح وأدلة لشراء وبيع السيارات', 'Guides and advice on buying and selling cars')}
      </h1>
      <p className="mt-3 text-base text-muted-foreground">
        {t(
          'ما الذي تفحصه قبل الشراء، كيف تقرأ سعر السوق، ومتى يكون الاستعمال ميزة — مكتوبة لمن يشتري سيارة في السعودية.',
          'What to check before you buy, how to read a market price, and when mileage is the wrong thing to worry about — written for people buying a car in Saudi Arabia.'
        )}
      </p>
    </HeaderShell>
  );
}

async function Articles({ locale, t, isAr, searchParams }) {
  const sp = await searchParams;
  const raw = sp?.tag;
  // One tag, and only a plausible one — a tag is a slug, not free text.
  const first = Array.isArray(raw) ? raw[0] : raw;
  const tag = typeof first === 'string' && /^[\w-]{1,40}$/.test(first) ? first.toLowerCase() : null;

  const [{ ready, items }, tags, site, seo] = await Promise.all([
    listBlogPosts({ tag, limit: 24 }),
    listBlogTags(),
    getSiteSettings(),
    /* Admin → Website content → Pages SEO → Blog. Only its structured_data is
       read here — the rest of that row is already applied by generateMetadata
       above, through pageMetadata('blog'). */
    resolvePageSeo('blog', locale),
  ]);

  const Arrow = isAr ? ArrowLeft : ArrowRight;
  const base = `/${locale}/marketplace/blog`;

  if (!ready || !items.length) {
    return (
      <>
        {tags.length ? <Tags tags={tags} base={base} active={tag} t={t} /> : null}
        <div className="mt-8 rounded-2xl border border-dashed border-gray-300 py-16 text-center dark:border-gray-700">
          <PenLine className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
          <p className="mt-3 font-semibold text-brand-primary">
            {tag
              ? t('لا مقالات بهذا الوسم بعد', 'Nothing under that tag yet')
              : t('المقالات في الطريق', 'The first articles are on their way')}
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {t(
              'حتى ذلك الحين، يمكنك تصفّح السيارات المعروضة الآن.',
              'In the meantime, the cars for sale are all here.'
            )}
          </p>
          <Link
            href={`/${locale}/marketplace/cars`}
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white"
          >
            {t('تصفّح السيارات', 'Browse cars')}
            <Arrow className="h-4 w-4" />
          </Link>
        </div>
      </>
    );
  }

  const text = (value) => pickText(value, locale, site.localeFallback);

  return (
    <>
      {tags.length ? <Tags tags={tags} base={base} active={tag} t={t} /> : null}

      {/* Google reads this to understand that /blog is a blog rather than a
          page that happens to have links on it. An admin who wrote their own
          structured data on the SEO screen replaces it outright rather than
          merging — a half-overridden graph is the hardest kind to debug. */}
      <JsonLd
        data={
          seo?.structuredData ?? {
            '@context': 'https://schema.org',
            '@type': 'Blog',
            url: `${SITE_URL}${base}`,
            blogPost: items.slice(0, 10).map((post) => ({
              '@type': 'BlogPosting',
              headline: text(post.title),
              url: `${SITE_URL}${base}/${post.slug}`,
              ...(post.published_at ? { datePublished: post.published_at } : {}),
              ...(post.author ? { author: { '@type': 'Person', name: post.author } } : {}),
            })),
          }
        }
      />

      {/* Two across on a phone, like the cars grid on the home page. The card
          itself is BlogCard, shared with "Read next" on the article — see the
          note there on why it is one component. */}
      <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3">
        {items.map((post, i) => (
          <BlogCard
            key={post.id}
            post={post}
            locale={locale}
            base={base}
            fallback={site.localeFallback}
            /* Two columns means four cards are above the fold on a phone. */
            priority={i < 4}
          />
        ))}
      </div>
    </>
  );
}

function Tags({ tags, base, active, t }) {
  return (
    <nav className="mt-7 flex flex-wrap items-center gap-2" aria-label={t('الوسوم', 'Tags')}>
      <Tag className="h-4 w-4 text-muted-foreground" />
      <Link
        href={base}
        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
          active
            ? 'bg-black/5 text-muted-foreground hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20'
            : 'bg-brand-primary text-white'
        }`}
      >
        {t('الكل', 'All')}
      </Link>
      {tags.map(({ tag, count }) => (
        <Link
          key={tag}
          href={`${base}?tag=${encodeURIComponent(tag)}`}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            active === tag
              ? 'bg-brand-primary text-white'
              : 'bg-black/5 text-muted-foreground hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20'
          }`}
        >
          {tag}
          <span className="ms-1 opacity-60 tabular-nums">{count}</span>
        </Link>
      ))}
    </nav>
  );
}

function ListSkeleton() {
  return (
    /* The same columns, gaps, corners and padding as the real grid. A fallback
       that lays out differently is a fallback that makes the page jump when the
       data arrives. */
    <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-2xl border sm:rounded-[22px] md:rounded-[26px] dark:border-white/10"
        >
          <Skeleton className="aspect-[1200/630] w-full rounded-none" />
          <div className="px-2.5 pb-2.5 pt-2 sm:px-4 sm:pb-4 sm:pt-3 md:px-5">
            <Skeleton className="h-2.5 w-12 rounded-full sm:h-3 sm:w-16" />
            <Skeleton className="mt-1.5 h-3 w-4/5 sm:h-3.5" />
            <Skeleton className="mt-1.5 h-2 w-full sm:h-2.5" />
            <Skeleton className="mt-1 h-2 w-2/3 sm:h-2.5" />
          </div>
        </div>
      ))}
    </div>
  );
}
