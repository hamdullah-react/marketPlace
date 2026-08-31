import 'server-only';

/**
 * The marketplace's Supabase client for the SERVER — server components, server
 * actions and route handlers.
 *
 * Anon key plus the user's cookies, so every query runs AS THE SIGNED-IN USER
 * and the RLS policies apply. This is the client that should read a seller's
 * own listings; getMarketplaceDb() is the service-role one that sees
 * everything and is for jobs that legitimately act for the platform.
 *
 * ── Why setAll can fail silently ────────────────────────────────────────────
 *
 * Supabase refreshes an expiring token during a read and then wants to write
 * the new one back. Server COMPONENTS cannot set cookies — only actions and
 * route handlers can — so the write throws there. It is caught and ignored on
 * purpose: proxy.js refreshes the token on every marketplace request, so the
 * cookie is already current by the time a component runs, and there is nothing
 * to lose by dropping the duplicate write.
 */

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { marketplacePublicEnv } from '@/marketplace/lib/env';

export async function getMarketplaceAuthServer() {
  const store = await cookies();
  const { url, anonKey } = marketplacePublicEnv();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // A server component. See the note above — proxy.js has already
          // written the refreshed cookie.
        }
      },
    },
  });
}
