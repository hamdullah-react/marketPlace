import Link from 'next/link';
import Image from 'next/image';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { ArrowLeft, ArrowRight, Calendar, Clock, PenLine, User } from 'lucide-react';
import RichTextRender, { hasRichText } from '@/app/[locale]/marketplace/(browse)/vendors/[slug]/_components/RichTextRender';
import { getBlogPost, listBlogSlugs, listRelatedPosts } from '@/marketplace/db/queries/blog';
import { getSiteLanguages, getSiteSettings } from '@/marketplace/db/queries/site';
import { SITE_URL } from '@/marketplace/lib/sitePages';
import { keywordList } from '@/marketplace/lib/seo';
import { absoluteUrl } from '@/marketplace/seo/pageMetadata';
import BlogCard from '../_components/BlogCard';
import CountView from '../_components/CountView';
import JsonLd from '../_components/JsonLd';
import { formatDate, pickDoc, pickText, readingMinutes } from '../_lib/text';

/**
 * The articles that exist at build time get built.
 *
 * Anything published afterwards is rendered on its first request and cached from
 * then on, so this is a head start rather than the whole list — which is what it
 * has to be on a blog somebody writes to after a deploy.
 */
export async function generateStaticParams() {
  const slugs = await listBlogSlugs();
  return slugs.slice(0, 50).map(({ slug }) => ({ slug }));
}

/**
 * An article's own metadata — every field the editor offers.
 *
 * Written here rather than through pageMetadata because the values belong to the
 * ROW, not to a page: its meta title, its keywords, its card, its publication
 * date. Each one falls back the way the editor's hints promise it will, and the
 * chain is written out once so the <head> and the JSON-LD below cannot disagree.
 *
 * Every fallback is a real one. An article with nothing but a title and a body
 * still gets a title, a description taken from its excerpt, a card image taken
 * from its banner, a canonical URL pointing at itself, and og:type=article — so
 * the SEO panel is somewhere to improve on the defaults rather than a form
 * somebody has to fill in before publishing.
 */
export async function generateMetadata({ params }) {
  const { locale, slug } = await params;

  const [post, site, langs] = await Promise.all([
    getBlogPost(slug),
    getSiteSettings(),
    getSiteLanguages(),
  ]);
  if (!post) return { title: 'Not found', robots: { index: false, follow: false } };

  const text = (value) => pickText(value, locale, site.localeFallback);

  const title = text(post.meta_title) || text(post.title) || post.slug;
  const description = text(post.meta_description) || text(post.excerpt) || undefined;

  const url = `${SITE_URL}/${locale}/marketplace/blog/${post.slug}`;
  // Blank means the article is its own original.
  const canonical = post.canonical_url || url;

  /* The card's words fall back to the search pair, then to the article. Its
     picture falls back through the two the author uploaded before reaching the
     site-wide default — a banner cropped to 1.91:1 is a better card than a logo. */
  const cardTitle = text(post.og_title) || title;
  const cardDescription = text(post.og_description) || description;
  const cardImage = absoluteUrl(post.og_image_url || post.banner_url || post.cover_url || site.defaultOgImageUrl);

  // X reads its own tags first and only falls back to OG for what it lacks.
  const xTitle = text(post.twitter_title) || cardTitle;
  const xDescription = text(post.twitter_description) || cardDescription;
  const xImage = absoluteUrl(post.twitter_image_url) || cardImage;

  const keywords = keywordList(post.meta_keywords?.[locale]);
  const handle = site.twitterHandle ? `@${site.twitterHandle.replace(/^@/, '')}` : undefined;

  return {
    title,
    description,
    keywords: keywords.length ? keywords : null,
    alternates: {
      canonical,
      // Only the languages the site actually offers get an hreflang, and an
      // article lives at the same slug in each.
      languages: Object.fromEntries(
        langs.enabled.map((code) => [code, `${SITE_URL}/${code}/marketplace/blog/${post.slug}`])
      ),
    },
    /* Two independent instructions. "noindex, follow" is what an author picks to
       keep an article out of search while still letting its links to the cars
       be crawled. */
    robots: {
      index: post.seo_index !== false,
      follow: post.seo_follow !== false,
      googleBot: { index: post.seo_index !== false, follow: post.seo_follow !== false },
    },
    openGraph: {
      type: post.og_type || 'article',
      title: cardTitle,
      description: cardDescription,
      url: canonical,
      siteName: pickText(site.name, locale, true),
      locale: locale === 'ar' ? 'ar_SA' : 'en_US',
      publishedTime: post.published_at ?? undefined,
      modifiedTime: post.updated_at ?? undefined,
      authors: post.author ? [post.author] : undefined,
      tags: post.tags?.length ? post.tags : undefined,
      images: cardImage ? [{ url: cardImage, width: 1200, height: 630, alt: cardTitle }] : undefined,
    },
    twitter: {
      card: post.twitter_card || 'summary_large_image',
      title: xTitle,
      description: xDescription,
      images: xImage ? [xImage] : undefined,
      site: handle,
      creator: handle,
    },
  };
}

/**
 * One article.
 *
 * ── The body is a document, not markup ─────────────────────────────────────
 *
 * RichTextRender walks the stored ProseMirror JSON and emits React elements. No
 * HTML is stored and none is produced, so there is nothing here to sanitise —
 * see the note at the top of that file and §28 of schema.sql.
 *
 * ── The page is cached; the view counter is not ────────────────────────────
 *
 * Everything here reads from cached queries, so a published article is served
 * without touching the database. The one thing that must happen on every single
 * request — counting the read — is isolated in <CountView>, which is the only
 * dynamic part of the page. See the note in that file.
 */
export default async function BlogArticlePage({ params }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const isAr = locale === 'ar';
  const t = (ar, en) => (isAr ? ar : en);
  const Back = isAr ? ArrowRight : ArrowLeft;

  const [post, site] = await Promise.all([getBlogPost(slug), getSiteSettings()]);
  if (!post) notFound();

  const text = (value) => pickText(value, locale, site.localeFallback);
  const lang = pickDoc(post.body, locale, site.localeFallback, hasRichText);
  const doc = lang ? post.body[lang] : null;

  const title = text(post.title) || post.slug;
  const excerpt = text(post.excerpt);
  const related = await listRelatedPosts({ id: post.id, tags: post.tags }, 3);

  const url = `${SITE_URL}/${locale}/marketplace/blog/${post.slug}`;
  const base = `/${locale}/marketplace/blog`;

  const hero = post.banner_url || post.cover_url;

  return (
    <article>
      {/* Invisible, and dynamic on purpose — see CountView. */}
      <Suspense fallback={null}>
        <CountView slug={post.slug} />
      </Suspense>

      {/* The admin's own structured data replaces the generated node outright
          rather than merging into it. A merge sounds friendlier and produces
          nonsense: an FAQPage with a BlogPosting's headline and datePublished
          folded in is not a valid anything, and half-overridden JSON-LD is the
          hardest kind to debug. Written or generated, never both. */}
      <JsonLd
        data={
          post.structured_data ?? {
            '@context': 'https://schema.org',
            '@type': 'BlogPosting',
            headline: title,
            description: excerpt || undefined,
            url,
            mainEntityOfPage: { '@type': 'WebPage', '@id': post.canonical_url || url },
            image: absoluteUrl(post.banner_url || post.cover_url) ?? undefined,
            datePublished: post.published_at ?? undefined,
            dateModified: post.updated_at ?? undefined,
            // The language the body is actually IN, which is not always the
            // page's — see the fallback note further down.
            inLanguage: lang ?? locale,
            keywords: [
              ...(post.tags ?? []),
              ...keywordList(post.meta_keywords?.[locale]),
            ].join(', ') || undefined,
            author: post.author
              ? { '@type': 'Person', name: post.author }
              : { '@type': 'Organization', name: pickText(site.name, locale, true) },
            publisher: {
              '@type': 'Organization',
              name: pickText(site.name, locale, true),
              logo: absoluteUrl(site.logoUrl) ?? undefined,
            },
          }
        }
      />

      {/* ── The title sits ON the picture ────────────────────────────────
          Built like the home carousel and the blog banner: full-bleed image, a
          scrim, the words over it, bottom-aligned. An article's picture is the
          first thing anybody sees of it, and boxing it into the reading column
          BELOW the title made it an illustration of the article rather than the
          top of it.

          The banner is the wide one; the cover stands in when there is no
          banner, which is the common case for an article written quickly.

          With NEITHER, the same header renders as ordinary text on the page.
          480px of empty colour is not a hero, it is a hole. */}
      {hero ? (
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
            src={hero}
            alt=""
            fill
            sizes="100vw"
            priority
            className="object-cover"
          />

          {/* Unconditional, for the reason the blog banner gives: an author
              uploads whatever picture they have, and white text over an unknown
              one is unreadable often enough that it cannot be a judgement call.
              Deepest at the foot, which is where the words are. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-10 bg-linear-to-b from-black/45 via-black/30 to-black/75"
          />

          <div className="relative z-20 mx-auto w-full max-w-[1600px] px-4 pb-7 pt-12 sm:px-8 sm:pb-12 sm:pt-16 lg:px-20 xl:px-28">
            <div className="max-w-3xl">
              <Link
                href={base}
                className="inline-flex items-center gap-1.5 text-sm text-white/80 transition-colors hover:text-white"
              >
                <Back className="h-4 w-4" />
                {t('المدونة', 'Blog')}
              </Link>

              {post.tags?.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5 sm:mt-4">
                  {post.tags.map((tag) => (
                    <Link
                      key={tag}
                      href={`${base}?tag=${encodeURIComponent(tag)}`}
                      className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/25"
                    >
                      {tag}
                    </Link>
                  ))}
                </div>
              ) : null}

              {/* Four steps rather than a jump from 30px straight to 48px: an
                  article title is a sentence, and on a phone at text-3xl a
                  long one runs to five lines and squeezes out the byline. */}
              <h1 className="mt-2.5 text-2xl font-bold leading-tight text-white drop-shadow-sm sm:mt-3 sm:text-3xl md:text-4xl lg:text-5xl">
                {title}
              </h1>

              {excerpt ? (
                /* Clamped on a phone only. The excerpt is repeated nowhere else
                    on this page, so it is not hidden — just kept from filling
                    the band before the reader reaches the article. */
                <p className="mt-2 line-clamp-2 max-w-2xl text-sm text-white/85 drop-shadow-sm sm:mt-3 sm:line-clamp-none sm:text-base lg:text-lg">
                  {excerpt}
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-white/75 sm:mt-5 sm:gap-y-2">
                <Byline post={post} doc={doc} locale={locale} t={t} />
              </div>
            </div>
          </div>
        </section>
      ) : (
        <div className="mx-auto w-full max-w-3xl px-4 pt-10 sm:px-6 lg:pt-14">
          <Link
            href={base}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-brand-primary"
          >
            <Back className="h-4 w-4" />
            {t('المدونة', 'Blog')}
          </Link>

          <header className="mt-4">
            {post.tags?.length ? (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {post.tags.map((tag) => (
                  <Link
                    key={tag}
                    href={`${base}?tag=${encodeURIComponent(tag)}`}
                    className="rounded-full bg-brand-primary/10 px-2.5 py-0.5 text-xs font-medium text-brand-primary transition-colors hover:bg-brand-primary/20"
                  >
                    {tag}
                  </Link>
                ))}
              </div>
            ) : null}

            <h1 className="text-3xl font-bold leading-tight text-brand-primary sm:text-4xl">
              {title}
            </h1>

            {excerpt ? <p className="mt-3 text-lg text-muted-foreground">{excerpt}</p> : null}

            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-y py-3 text-xs text-muted-foreground dark:border-white/10">
              <Byline post={post} doc={doc} locale={locale} t={t} />
            </div>
          </header>
        </div>
      )}

      {/* The reading column. The hero above is full-bleed and everything from
          here down is prose, which has a width beyond which it stops being
          readable — so the constraint moved off the page root and onto this. */}
      <div className="mx-auto w-full max-w-3xl px-4 pb-14 sm:px-6">
      {/* The body is written in one language and read in the same one. When the
          fallback supplied the other, the paragraph direction has to follow the
          TEXT rather than the page, or an English article inside an Arabic shell
          renders right-aligned with its punctuation in the wrong place. */}
      {doc ? (
        <div
          dir={lang === 'ar' ? 'rtl' : 'ltr'}
          className={lang === locale ? 'mt-10' : 'mt-10 text-start'}
        >
          <RichTextRender doc={doc} className="blog-body" />
        </div>
      ) : (
        <p className="mt-8 rounded-xl border border-dashed p-4 text-sm text-muted-foreground sm:p-6 dark:border-white/10">
          {t(
            'هذا المقال غير متوفر بلغتك بعد.',
            'This article has not been written in your language yet.'
          )}
        </p>
      )}

      {related.length ? (
        <section className="mt-14 border-t pt-8 dark:border-white/10">
          <h2 className="text-base font-semibold text-brand-primary sm:text-lg">
            {t('اقرأ أيضاً', 'Read next')}
          </h2>

          {/* Two across on a phone like the list, three from sm. Three 110px
              columns on a phone is not a card, it is a thumbnail with a
              caption nobody can read. */}
          {/* The SAME card as the list. It used to be its own markup here and
              drifted immediately — a different title size, no tags, no
              description. One component is what stops that happening again. */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            {related.map((item) => (
              <BlogCard
                key={item.id}
                post={item}
                locale={locale}
                base={base}
                fallback={site.localeFallback}
                /* Below the article, so never above the fold. */
                sizes="(max-width: 640px) 50vw, 260px"
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* An article is read by somebody who has not decided to buy yet. This is
          the one place on the page that assumes they might. */}
      <aside className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-brand-primary/5 p-4 sm:mt-12 sm:p-6">
        <div>
          <p className="text-sm font-semibold text-brand-primary sm:text-base">
            {t('جاهز للبحث عن سيارتك؟', 'Ready to find your car?')}
          </p>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            {t(
              'سيارات جديدة ومستعملة من معارض موثوقة في كل السعودية.',
              'New and used cars from verified showrooms across Saudi Arabia.'
            )}
          </p>
        </div>
        <Link
          href={`/${locale}/marketplace/cars`}
          /* Full width on a phone, matching the banner's CTA — the two are the
             same offer and should not be two different shapes. */
          className="raised-solid inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-primary px-4 py-2.5 text-sm font-medium text-white sm:w-auto sm:py-2"
        >
          {t('تصفّح السيارات', 'Browse cars')}
          {isAr ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
        </Link>
      </aside>
      </div>
    </article>
  );
}

/**
 * Author, date and reading time.
 *
 * Extracted because it is rendered twice — once white on the hero, once grey on
 * the plain header — and the two must never drift apart. The COLOUR is the
 * caller's; everything else is here.
 */
function Byline({ post, doc, locale, t }) {
  return (
    <>
      {post.author ? (
        <span className="inline-flex items-center gap-1.5">
          <User className="h-3.5 w-3.5" />
          {post.author}
        </span>
      ) : null}

      {post.published_at ? (
        <span className="inline-flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5" />
          <time dateTime={post.published_at}>{formatDate(post.published_at, locale)}</time>
        </span>
      ) : null}

      {doc ? (
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          {t(`${readingMinutes(doc)} دقائق قراءة`, `${readingMinutes(doc)} min read`)}
        </span>
      ) : null}
    </>
  );
}
