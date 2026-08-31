'use client';

/**
 * The marketplace's Supabase client for the BROWSER.
 *
 * Signs in with the anon key, which is public by design: it grants exactly what
 * the RLS policies allow and nothing else. That is the whole bargain of putting
 * auth in the database — the key in the bundle is not a secret, the policies
 * are the boundary. See src/marketplace/db/auth-schema.sql.
 *
 * NOT the same connection as getMarketplaceDb(). That one holds the SERVICE
 * ROLE key, bypasses RLS entirely, and must never reach the browser. Two
 * clients, two keys, two trust levels — the file split is what keeps them from
 * being confused for one another.
 */

import { createBrowserClient } from '@supabase/ssr';
import { marketplacePublicEnv } from '@/marketplace/lib/env';

let _client = null;

export function getMarketplaceAuthClient() {
  // createBrowserClient memoises internally, but a module-level handle also
  // keeps the auth state listener single — two clients means two token refresh
  // timers racing to write the same cookie.
  if (_client) return _client;

  const { url, anonKey } = marketplacePublicEnv();
  _client = createBrowserClient(url, anonKey);
  return _client;
}
