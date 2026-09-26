import 'server-only';

/**
 * Reading the blog.
 *
 * ── Two readers, two rules ──────────────────────────────────────────────────
 *
 * `list*` / `get*` are the PUBLIC ones and only ever see published articles.
 * `read*` are the ADMIN ones and see everything, drafts included — the same
 * naming split the site-content queries use, so which one an import is asking
 * for is visible at the call site rather than in a flag somebody can get wrong.
 *
 * ── They never throw ────────────────────────────────────────────────────────
 *
 * A blog is an addition to a marketplace, not the marketplace. A missing table
 * (the BLOG section not run yet) or an unreachable database gives an empty list
 * and a page that says so — never a 500 on a site whose job is selling cars.
 *
 * It is also what makes `use cache` safe here: a throw inside a cached scope
 * cancels the whole render, so a reader that swallows its errors is a
 * requirement rather than a courtesy.
 *
 * ── The public ones are cached, under one tag ───────────────────────────────
 *
 * An article changes when somebody edits it and at no other time, which is the
 * case `use cache` exists for — the alternative is a database round trip on
 * every read of a page whose content was fixed the moment it was published.
 *
 * One tag for all of them rather than a tag per article: publishing changes the
 * list, the tag page, the related-articles strip and the sitemap at once, and
 * there is no version of this where an admin saves a post and wants some of
 * those to keep showing the old one. The blog actions call updateTag() on save,
 * so the admin sees their own write immediately.
 */

import { cacheLife, cacheTag } from 'next/cache';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { SITE_TAGS } from '@/marketplace/lib/sitePages';
import { isMissingSchema } from './engagement';

/* The body is deliberately absent from the LIST select. An article is a few
   kilobytes of document JSON and a list of twenty would carry all of it across
   the wire to render a title and one line. */
const CARD =
  'id, slug, title, excerpt, cover_url, banner_url, author, tags, published, published_at, updated_at';

/* Every SEO column, because the article page's generateMetadata reads all of
   them and the admin editor has a field for each. Spelled out rather than '*':
   an explicit list is what makes adding a column a deliberate act on both
   sides, and it is what stops a future private column leaking into a public
   read. */
const SEO = [
  'meta_title', 'meta_description', 'meta_keywords', 'focus_keyword',
  'og_title', 'og_description', 'og_image_url', 'og_type',
  'twitter_card', 'twitter_title', 'twitter_description', 'twitter_image_url',
  'canonical_url', 'seo_index', 'seo_follow', 'seo_changefreq', 'seo_priority',
  'structured_data',
].join(', ');

const FULL = `${CARD}, body, ${SEO}, views`;

/** Published articles, newest first. */
export async function listBlogPosts({ tag = null, limit = 24, offset = 0 } = {}) {
  'use cache';
  cacheLife('hours');
  cacheTag(SITE_TAGS.blog);

  try {
    let query = getMarketplaceDb()
      .from('blog_posts')
      .select(CARD, { count: 'exact' })
      .eq('published', true)
      .order('published_at', { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);

    // `contains` on a text[] — the gin index answers it.
    if (tag) query = query.contains('tags', [tag]);

    const { data, error, count } = await query;
    if (error) return { ready: !isMissingSchema(error), items: [], total: 0 };

    return { ready: true, items: data ?? [], total: count ?? 0 };
  } catch {
    return { ready: false, items: [], total: 0 };
  }
}

/** One published article, by its slug. Null when it does not exist or is a draft. */
export async function getBlogPost(slug) {
  'use cache';
  cacheLife('hours');
  cacheTag(SITE_TAGS.blog);

  if (!slug) return null;

  try {
    const { data, error } = await getMarketplaceDb()
      .from('blog_posts')
      .select(FULL)
      .eq('slug', slug)
      .eq('published', true)
      .maybeSingle();

    if (error) return null;
    return data ?? null;
  } catch {
    return null;
  }
}

/**
 * The tags actually in use, with how many articles carry each.
 *
 * Read from the articles rather than from a tags table: a tag with no articles
 * is a filter that returns an empty page, and the set changes every time
 * somebody writes something. Counted here rather than in SQL because PostgREST
 * cannot group by an unnested array without a view.
 */
export async function listBlogTags() {
  'use cache';
  cacheLife('hours');
  cacheTag(SITE_TAGS.blog);

  try {
    const { data, error } = await getMarketplaceDb()
      .from('blog_posts')
      .select('tags')
      .eq('published', true);

    if (error) return [];

    const counts = new Map();
    for (const row of data ?? []) {
      for (const tag of row.tags ?? []) {
        if (!tag) continue;
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }

    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  } catch {
    return [];
  }
}

/**
 * Articles related to this one — same tags, newest first.
 *
 * Related-by-tag rather than "latest three": a reader at the bottom of a buying
 * guide is more likely to want another buying guide than whatever happened to
 * be published last. Falls back to the newest when an article has no tags, so
 * the section is never empty on a page that has room for it.
 *
 * Takes the id and the tags rather than the row: the arguments of a cached
 * function are its cache key, and keying this on the whole article would give
 * every save a fresh entry for a result that did not change.
 */
export async function listRelatedPosts({ id, tags } = {}, limit = 3) {
  'use cache';
  cacheLife('hours');
  cacheTag(SITE_TAGS.blog);

  if (!id) return [];

  try {
    const db = getMarketplaceDb();

    const base = () =>
      db
        .from('blog_posts')
        .select(CARD)
        .eq('published', true)
        .neq('id', id)
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(limit);

    if (tags?.length) {
      const { data } = await base().overlaps('tags', tags);
      if (data?.length) return data;
    }

    const { data } = await base();
    return data ?? [];
  } catch {
    return [];
  }
}

/**
 * The banner across the top of /blog.
 *
 * One row (see the BLOG section of schema.sql), read on one page, cached under
 * the same tag as the articles — publishing an article and changing the banner
 * are both "the blog changed", and there is no version of this where an admin
 * wants one of them to show and the other to wait an hour.
 *
 * Returns null when there is nothing to show: the table is missing, the row was
 * switched off, or nobody has written a heading or uploaded a picture. The page
 * then renders its own built-in wording, which is what a site that has not got
 * round to designing a banner should look like.
 */
export async function getBlogBanner() {
  'use cache';
  cacheLife('hours');
  cacheTag(SITE_TAGS.blog);

  try {
    const { data, error } = await getMarketplaceDb()
      .from('blog_banner')
      .select('*')
      .eq('id', true)
      .maybeSingle();

    if (error || !data || data.active === false) return null;

    const has = (value) => Boolean(value?.ar || value?.en);
    if (!data.image_url && !has(data.heading) && !has(data.subheading)) return null;

    return data;
  } catch {
    return null;
  }
}

/** The banner as it is now, for the admin form. Uncached, and never null. */
export async function readBlogBanner() {
  try {
    const { data, error } = await getMarketplaceDb()
      .from('blog_banner')
      .select('*')
      .eq('id', true)
      .maybeSingle();

    if (error) return { ready: !isMissingSchema(error), row: null };
    return { ready: true, row: data ?? null };
  } catch {
    return { ready: false, row: null };
  }
}

/* ── The admin's side: drafts included ─────────────────────────────────────
   Uncached and unfiltered, so somebody editing always sees the row as it is
   now rather than as a cached public read left it. */

export async function readBlogPosts() {
  try {
    const { data, error } = await getMarketplaceDb()
      .from('blog_posts')
      // The admin list shows a read count the public one has no use for.
      .select(`${CARD}, views`)
      .order('updated_at', { ascending: false });

    if (error) return { ready: !isMissingSchema(error), items: [] };
    return { ready: true, items: data ?? [] };
  } catch {
    return { ready: false, items: [] };
  }
}

export async function readBlogPost(slug) {
  if (!slug) return null;

  try {
    const { data, error } = await getMarketplaceDb()
      .from('blog_posts')
      .select(FULL)
      .eq('slug', slug)
      .maybeSingle();

    if (error) return null;
    return data ?? null;
  } catch {
    return null;
  }
}

/**
 * One read of one published article.
 *
 * Counted on the server, on the back of the page render, rather than from the
 * browser: a fetch from a client can be replayed, and a view counter anybody can
 * type into is not a number worth storing. The database adds 1 in a single
 * statement, so simultaneous readers both count.
 *
 * Failure is silent by design — a page must not 500 because a statistic did not
 * save. The fallback read-then-write is only for a database where the BLOG
 * section has not been run yet.
 */
export async function recordBlogView(slug) {
  if (!slug || typeof slug !== 'string') return false;

  try {
    const db = getMarketplaceDb();

    const { error } = await db.rpc('increment_blog_views', { target: slug });
    if (!error) return true;
    if (!isMissingSchema(error)) return false;

    const { data } = await db
      .from('blog_posts')
      .select('views')
      .eq('slug', slug)
      .eq('published', true)
      .maybeSingle();
    if (!data) return false;

    await db.from('blog_posts').update({ views: (data.views ?? 0) + 1 }).eq('slug', slug);
    return true;
  } catch {
    return false;
  }
}

/**
 * Every published slug, for the sitemap.
 *
 * Only the indexable ones: an article an admin has told search engines to skip
 * has no business being advertised in a sitemap, which is a list of pages we
 * are asking them to visit.
 */
export async function listBlogSlugs() {
  'use cache';
  cacheLife('hours');
  cacheTag(SITE_TAGS.blog);

  try {
    const { data, error } = await getMarketplaceDb()
      .from('blog_posts')
      .select('slug, published_at, updated_at, seo_changefreq, seo_priority')
      .eq('published', true)
      .eq('seo_index', true)
      .order('published_at', { ascending: false, nullsFirst: false });

    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
}
