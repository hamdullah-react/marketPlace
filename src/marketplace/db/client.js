/**
 * SECOND DATABASE — the only file that opens a connection to it.
 *
 * Separate Supabase project from the main site. Nothing here may import
 * @/lib/supabase, and no query may join across the two databases
 * (docs/MARKETPLACE-STRUCTURE.md §6). If the marketplace needs car reference
 * data, it gets a synced copy in this DB.
 */
import { createClient } from '@supabase/supabase-js';
import { marketplaceEnv } from '@/marketplace/lib/env';

let _db = null;

export function getMarketplaceDb() {
  if (_db) return _db;

  const { url, serviceRoleKey } = marketplaceEnv();

  _db = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: 'public' },
    global: { headers: { 'x-client-info': 'alromaih-marketplace' } },
  });

  return _db;
}
