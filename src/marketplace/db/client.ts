/**
 * SECOND DATABASE — the only file that opens a connection to it.
 *
 * Separate Supabase project from the main site. Nothing here may import
 * @/lib/supabase, and no query may join across the two databases
 * (docs/MARKETPLACE-STRUCTURE.md §6). If the marketplace needs car reference
 * data, it gets a synced copy in this DB.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { marketplaceEnv } from '@/marketplace/lib/env';
import type { Database } from './types';

/**
 * The generic argument is the whole point of this file being typed.
 *
 * `createClient<Database>` is what makes `.from('listings')` know its columns:
 * the table name is checked against the 41 in db/types.ts, `.eq('stat', ...)`
 * stops compiling, and the `data` that comes back is a real Row rather than
 * `any`. Nothing else in the query layer has to annotate anything for that to
 * work — it flows from here.
 */
export type MarketplaceDb = SupabaseClient<Database>;

let _db: MarketplaceDb | null = null;

export function getMarketplaceDb(): MarketplaceDb {
  if (_db) return _db;

  const { url, serviceRoleKey } = marketplaceEnv();

  _db = createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: 'public' },
    global: { headers: { 'x-client-info': 'alromaih-marketplace' } },
  });

  return _db;
}
