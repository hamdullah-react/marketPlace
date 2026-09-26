import { after, connection } from 'next/server';
import { recordBlogView } from '@/marketplace/db/queries/blog';

/**
 * Counts one reading of one article. Renders nothing.
 *
 * ── Why this is a component and not two lines in the page ───────────────────
 *
 * The article itself is cached: its content changes when somebody edits it and
 * at no other time, so a reader should be served a prerendered page rather than
 * a database round trip. But a cached page does not RENDER on every request —
 * that is the point of it — so `after()` written in the page body would have
 * counted cache misses, which is roughly "how often the cache expired" and not
 * a readership figure at all. It would have been a number that looked real.
 *
 * `connection()` makes this component dynamic, so it alone is excluded from the
 * prerender and runs once per request while everything around it stays cached.
 * It returns null, so the dynamic hole has no visible content and nothing about
 * the page shifts when it streams in.
 *
 * `after()` then defers the write until the response has been sent: a slow
 * database never delays a reader, and recordBlogView swallows its own failures,
 * so a statistic can never turn an article into an error page.
 */
export default async function CountView({ slug }) {
  await connection();
  after(() => recordBlogView(slug));
  return null;
}
