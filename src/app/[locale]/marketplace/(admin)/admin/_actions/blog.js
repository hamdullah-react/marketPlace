'use server';

/**
 * Writing, publishing and removing an article.
 *
 * ── The body arrives as a DOCUMENT and is validated as one ──────────────────
 *
 * The editor posts ProseMirror JSON and this checks its shape before it is
 * stored — `type: "doc"` with a content array, nothing else accepted. That is
 * not belt-and-braces over the editor: a server action is a public endpoint,
 * and "the only thing that posts here is our own form" has never been true of
 * anything on the web.
 *
 * What it deliberately does NOT do is sanitise. There is nothing to sanitise,
 * because nothing downstream turns this into markup — RichTextRender walks the
 * tree and emits React elements, and a node type it does not recognise renders
 * as nothing. See §28 and the BLOG section of schema.sql.
 */

import { after } from 'next/server';
import { revalidatePath, updateTag } from 'next/cache';
import { adminForAction } from '@/marketplace/auth/session';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { writeAudit } from '@/marketplace/db/queries/admin';
import { notifyNewArticle } from '@/marketplace/db/queries/notifications';
import { isMissingSchema } from '@/marketplace/db/queries/engagement';
import { SITE_TAGS, CHANGEFREQ, OG_TYPES, TWITTER_CARDS } from '@/marketplace/lib/sitePages';
import { keywordList } from '@/marketplace/lib/seo';

const str = (fd, k) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};
const flag = (fd, k) => ['on', 'true', '1'].includes(str(fd, k));
const stamp = () => Date.now() + Math.random();
const ok = (data = {}) => ({ ok: true, error: null, token: stamp(), ...data });
const bad = (error, extra = {}) => ({ ok: false, error, token: stamp(), ...extra });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Runs work after the response; inline where there is no request scope. The
 *  same shape db/queries/notifications.js uses. */
function later(work) {
  try {
    after(work);
  } catch {
    work();
  }
}

/** `titleAr` + `titleEn` → {ar, en}, empties dropped. */
function bilingual(fd, base, max = 2000) {
  const out = {};
  const ar = str(fd, `${base}Ar`).slice(0, max);
  const en = str(fd, `${base}En`).slice(0, max);
  if (ar) out.ar = ar;
  if (en) out.en = en;
  return out;
}

/**
 * The editor's document, checked.
 *
 * 400 KB is a very long article and a very cheap ceiling — without one, a
 * single post could be made large enough to slow every page that lists it.
 */
function editorDoc(fd, k) {
  const raw = str(fd, k);
  if (!raw) return null;
  if (raw.length > 400_000) return { invalid: true };

  let doc;
  try {
    doc = JSON.parse(raw);
  } catch {
    return { invalid: true };
  }

  if (!doc || doc.type !== 'doc' || !Array.isArray(doc.content ?? [])) return { invalid: true };
  return { doc };
}

/**
 * A URL path segment made from a title.
 *
 * ── Why a fallback is not optional here ─────────────────────────────────────
 *
 * Half of this site is written in Arabic, and an Arabic title reduces to
 * nothing at all under an ASCII rule. A percent-encoded Arabic slug is
 * technically valid and useless in practice: it cannot be read in a link, typed
 * from memory, or pasted into a message without turning into forty characters
 * of noise. So a title with no ASCII gets a generated slug, and the admin can
 * type a better one over it — the field is theirs, this is only the default.
 */
function slugify(value) {
  const base = String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return base || `post-${Math.random().toString(36).slice(2, 8)}`;
}

/** Tags: lower-cased, de-duplicated, and capped. */
function tagList(fd, k) {
  const raw = str(fd, k);

  let value = raw;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) value = parsed;
  } catch {
    value = raw.split(',');
  }

  const list = (Array.isArray(value) ? value : [])
    .map((tag) => String(tag ?? '').trim().toLowerCase().replace(/\s+/g, '-'))
    .filter(Boolean)
    .map((tag) => tag.slice(0, 40));

  return [...new Set(list)].slice(0, 8);
}

/**
 * A URL somebody typed, or null.
 *
 * Checked rather than stored verbatim because these go into a `<link rel=
 * canonical>` and an `og:image`: a `javascript:` value in either is the same
 * class of hole the editor's protocol allowlist exists to close, one attribute
 * along. Anything unparseable is rejected outright rather than silently blanked,
 * so a typo in a canonical URL is reported instead of losing the field.
 */
function webUrl(value, field) {
  if (!value) return { url: null };

  let url;
  try {
    url = new URL(value);
  } catch {
    return { invalid: field };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { invalid: field };
  return { url: url.toString() };
}

/** An uploaded picture (absolute) or one of the app's own files ("/…"). */
function imageUrl(value, field) {
  if (!value) return { url: null };
  if (value.startsWith('/') && !value.startsWith('//')) return { url: value };
  return webUrl(value, field);
}

/** A TagsInput posts JSON; a hand-made post may send commas. */
function keywords(fd, k) {
  const raw = str(fd, k);

  let value = raw;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) value = parsed;
  } catch {
    /* plain text — keywordList splits it */
  }

  return keywordList(value).map((w) => w.slice(0, 80)).slice(0, 25);
}

/** One of a closed set, or the default. A posted value is never trusted. */
const oneOf = (list, value, fallback) => (list.includes(value) ? value : fallback);

const dbFail = (error) =>
  bad(isMissingSchema(error) ? 'BLOG_NOT_MIGRATED' : 'SAVE_FAILED', { detail: error.message });

async function guard() {
  const { viewer, error } = await adminForAction();
  return error ? { denied: bad(error) } : { viewer };
}

/**
 * Everywhere an article can appear.
 *
 * updateTag FIRST, because that is the one that matters: the public readers are
 * cached under SITE_TAGS.blog (see db/queries/blog.js) and would otherwise keep
 * serving the old article for an hour. updateTag also gives this request
 * read-your-own-writes, so the admin's own next read is the version they just
 * saved rather than whatever the cache still holds.
 *
 * The revalidatePath calls stay for the rendered pages themselves.
 */
function refresh(slug = null) {
  updateTag(SITE_TAGS.blog);
  revalidatePath('/[locale]/marketplace/admin/content/blog', 'page');
  revalidatePath('/[locale]/marketplace/blog', 'page');
  if (slug) revalidatePath(`/[locale]/marketplace/blog/${slug}`, 'page');
  // The sitemap lists every published article.
  revalidatePath('/sitemap.xml', 'page');
}

/**
 * Tell every buyer about an article that has just gone live.
 *
 * Called from BOTH paths that can publish one — saving with the switch on, and
 * the publish item in the list's row menu — because an admin has no idea which
 * of the two they used and would rightly expect the same thing to happen.
 *
 * Doing that safely is notifyNewArticle's job, not the caller's: it refuses to
 * announce a slug it has already announced, so republishing after a typo fix
 * stays silent. See the note on it.
 *
 * Deliberately NOT awaited. A bell is a courtesy on top of a save that has
 * already succeeded — the same rule the whole notifications module is built on
 * — so a slow or failing broadcast must never hold the editor open or turn a
 * successful publish into an error.
 */
function announce(post) {
  later(() =>
    notifyNewArticle({
      post,
      // Locale-relative; the bell prefixes it when it renders.
      href: `/marketplace/blog/${post.slug}`,
    })
  );
}

/**
 * Create or update one article.
 *
 * ── published_at is stamped once, here ──────────────────────────────────────
 *
 * Set the first time an article goes live and never rewritten afterwards. The
 * public list is ordered by it, so un-publishing an old post to fix a typo and
 * publishing it again must not send it back to the top as though it were new —
 * the same rule listings.published_at follows.
 */
export async function saveBlogPost(prevState, formData) {
  const { viewer, denied } = await guard();
  if (denied) return denied;

  const id = str(formData, 'id');
  if (id && !UUID.test(id)) return bad('NOT_FOUND');

  const title = bilingual(formData, 'title', 200);
  if (!title.ar && !title.en) return bad('BLOG_TITLE_REQUIRED');

  const ar = editorDoc(formData, 'bodyAr');
  const en = editorDoc(formData, 'bodyEn');
  if (ar?.invalid || en?.invalid) return bad('CONTENT_INVALID');

  // Typed by the admin, or derived from whichever title exists.
  const slug = slugify(str(formData, 'slug') || title.en || title.ar);

  const published = flag(formData, 'published');

  const row = {
    slug,
    title,
    excerpt: bilingual(formData, 'excerpt', 400),
    body: {
      ...(ar?.doc ? { ar: ar.doc } : {}),
      ...(en?.doc ? { en: en.doc } : {}),
    },
    author: str(formData, 'author').slice(0, 80) || null,
    tags: tagList(formData, 'tags'),
    published,
  };

  /* ── The pictures and the two URLs ──────────────────────────────────────
     Each is checked, and the first bad one is reported rather than quietly
     dropped: a canonical URL that silently vanishes is worse than one that
     refuses to save, because nobody finds out. */
  const urls = {
    cover_url: imageUrl(str(formData, 'coverUrl'), 'cover'),
    banner_url: imageUrl(str(formData, 'bannerUrl'), 'banner'),
    og_image_url: imageUrl(str(formData, 'ogImageUrl'), 'share image'),
    twitter_image_url: imageUrl(str(formData, 'twitterImageUrl'), 'X image'),
    canonical_url: webUrl(str(formData, 'canonicalUrl'), 'canonical'),
  };
  for (const [column, result] of Object.entries(urls)) {
    if (result.invalid) return bad('INVALID_URL', { params: { field: result.invalid } });
    row[column] = result.url;
  }

  /* ── Structured data ────────────────────────────────────────────────────
     Arbitrary JSON-LD by design (see the BLOG section of schema.sql), so the
     only thing checked is that it parses and is an object. It is rendered
     through JSON.stringify with `<` escaped, never as markup. */
  const rawJson = str(formData, 'structuredData');
  if (rawJson) {
    let parsed;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      return bad('SEO_JSON_INVALID');
    }
    if (!parsed || typeof parsed !== 'object') return bad('SEO_JSON_INVALID');
    row.structured_data = parsed;
  } else {
    row.structured_data = null;
  }

  const priority = Number(str(formData, 'seoPriority') || 0.6);
  if (!Number.isFinite(priority) || priority < 0 || priority > 1) return bad('SEO_PRIORITY_INVALID');

  Object.assign(row, {
    meta_title: bilingual(formData, 'metaTitle', 200),
    meta_description: bilingual(formData, 'metaDescription', 400),
    meta_keywords: {
      ar: keywords(formData, 'metaKeywordsAr'),
      en: keywords(formData, 'metaKeywordsEn'),
    },
    focus_keyword: bilingual(formData, 'focusKeyword', 100),
    og_title: bilingual(formData, 'ogTitle', 200),
    og_description: bilingual(formData, 'ogDescription', 400),
    // 'article' rather than 'website': it is what makes a share card carry a
    // date and a byline.
    og_type: oneOf(OG_TYPES, str(formData, 'ogType'), 'article'),
    twitter_card: oneOf(TWITTER_CARDS, str(formData, 'twitterCard'), 'summary_large_image'),
    twitter_title: bilingual(formData, 'twitterTitle', 200),
    twitter_description: bilingual(formData, 'twitterDescription', 400),
    seo_index: flag(formData, 'seoIndex'),
    seo_follow: flag(formData, 'seoFollow'),
    seo_changefreq: oneOf(CHANGEFREQ, str(formData, 'seoChangefreq'), 'monthly'),
    seo_priority: Math.round(priority * 10) / 10,
  });

  const db = getMarketplaceDb();

  /* The existing row decides two things: whether this is an update, and
     whether published_at has already been claimed. */
  let existing = null;
  if (id) {
    const { data } = await db.from('blog_posts').select('id, slug, published_at').eq('id', id).maybeSingle();
    existing = data ?? null;
    if (!existing) return bad('NOT_FOUND');
  }

  /* The first time it goes live, and only then. `published_at` already
     encodes that — it is stamped once and never rewritten — so it doubles as
     "has this ever been public", which is exactly what decides the bell. */
  const goingLive = published && !existing?.published_at;
  if (goingLive) row.published_at = new Date().toISOString();

  const { data: saved, error } = existing
    ? await db.from('blog_posts').update(row).eq('id', id).select('id, slug').maybeSingle()
    : await db.from('blog_posts').insert(row).select('id, slug').maybeSingle();

  if (error) {
    // 23505 — the slug is taken. It is the one failure an author can fix.
    if (error.code === '23505') return bad('BLOG_SLUG_TAKEN');
    return dbFail(error);
  }

  await writeAudit(viewer, existing ? 'blog.update' : 'blog.create', 'blog_posts', saved?.id ?? null, null, {
    slug,
    published,
  });

  refresh(slug);
  // The old path too, when a rename moved the article.
  if (existing?.slug && existing.slug !== slug) refresh(existing.slug);

  if (goingLive) announce({ slug, title: row.title, excerpt: row.excerpt });

  return ok({ id: saved?.id ?? null, slug });
}

/** Publish or unpublish, without opening the editor. */
export async function setBlogPostPublished(prevState, formData) {
  const { viewer, denied } = await guard();
  if (denied) return denied;

  const id = str(formData, 'id');
  if (!UUID.test(id)) return bad('NOT_FOUND');

  const published = str(formData, 'published') === 'true';

  const db = getMarketplaceDb();
  /* title and excerpt come along because the notification SNAPSHOTS them —
     see notifyNewArticle. Reading them here costs nothing: it is the same row
     the publish state is read from. */
  const { data: post } = await db
    .from('blog_posts')
    .select('id, slug, title, excerpt, published_at')
    .eq('id', id)
    .maybeSingle();

  if (!post) return bad('NOT_FOUND');

  const patch = { published };
  // First time only — see the note on saveBlogPost.
  const goingLive = published && !post.published_at;
  if (goingLive) patch.published_at = new Date().toISOString();

  const { error } = await db.from('blog_posts').update(patch).eq('id', id);
  if (error) return dbFail(error);

  await writeAudit(viewer, 'blog.publish', 'blog_posts', id, null, { slug: post.slug, published });

  refresh(post.slug);

  if (goingLive) announce(post);

  return ok({ published });
}

/**
 * The banner across the top of /blog.
 *
 * One row, upserted, so there is nothing to create and nothing to delete —
 * clearing every field and switching it off is how it goes away, and the row
 * itself is seeded by schema.sql.
 *
 * The CTA is the only part with a rule worth stating: a label with no link is a
 * button that goes nowhere, so the pair is kept together — give it both or
 * neither, and neither is the default.
 */
export async function saveBlogBanner(prevState, formData) {
  const { viewer, denied } = await guard();
  if (denied) return denied;

  const image = imageUrl(str(formData, 'imageUrl'), 'banner image');
  if (image.invalid) return bad('INVALID_URL', { params: { field: image.invalid } });

  /* The link may be a path on this site as well as a full URL — "/cars" is the
     most useful destination a blog banner has, and it is not a URL. */
  const rawHref = str(formData, 'ctaHref');
  let href = null;
  if (rawHref) {
    if (rawHref.startsWith('/') && !rawHref.startsWith('//')) {
      href = rawHref.slice(0, 500);
    } else {
      const checked = webUrl(rawHref, 'link');
      if (checked.invalid) return bad('INVALID_URL', { params: { field: checked.invalid } });
      href = checked.url;
    }
  }

  const label = bilingual(formData, 'ctaLabel', 60);

  const row = {
    id: true,
    heading: bilingual(formData, 'heading', 120),
    subheading: bilingual(formData, 'subheading', 300),
    image_url: image.url,
    alt: bilingual(formData, 'alt', 160),
    // Dropped together: a label with no link, or a link with no label, is a
    // half-built button rather than a smaller one.
    cta_label: href ? label : {},
    cta_href: label.ar || label.en ? href : null,
    active: flag(formData, 'active'),
  };

  const { error } = await getMarketplaceDb()
    .from('blog_banner')
    .upsert(row, { onConflict: 'id' });

  if (error) return dbFail(error);

  await writeAudit(viewer, 'blog.banner', 'blog_banner', null, null, { active: row.active });

  refresh(null);
  return ok({ saved: true });
}

/**
 * Remove an article.
 *
 * A hard delete, unlike a lead: nothing references a post, no report counts
 * them, and an article taken down is meant to be gone rather than hidden. The
 * audit entry carries the slug, so "what was at /blog/x" still has an answer.
 */
export async function deleteBlogPost(prevState, formData) {
  const { viewer, denied } = await guard();
  if (denied) return denied;

  const id = str(formData, 'id');
  if (!UUID.test(id)) return bad('NOT_FOUND');

  const db = getMarketplaceDb();
  const { data: gone, error } = await db
    .from('blog_posts')
    .delete()
    .eq('id', id)
    .select('slug, title, published')
    .maybeSingle();

  if (error) return dbFail(error);
  if (!gone) return bad('NOT_FOUND');

  await writeAudit(viewer, 'blog.delete', 'blog_posts', id, gone, null);

  refresh(gone.slug);
  return ok({ deleted: id });
}
