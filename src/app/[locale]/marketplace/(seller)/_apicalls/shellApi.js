import { getVendorOptions } from '@/marketplace/db/queries/seller';
import { countUnreadLeads } from '@/marketplace/db/queries/leads';
import { getViewer } from '@/marketplace/auth/session';
import { localized } from '@/marketplace/lib/listing';

/**
 * What the (seller) shell reads — the showroom it is showing, and who is
 * looking at it.
 *
 * Calls the query layer directly rather than fetching /api/marketplace/*: the
 * layout is a server component, so an HTTP hop to our own route would cost a
 * round trip and the connection pool for nothing. The HTTP routes are for
 * CLIENT code and sit on this same query layer.
 */
export async function getShellVendor(locale = 'ar') {
  let vendors = [];
  try {
    vendors = await getVendorOptions();
  } catch {
    // A failure must not take down the dashboard — fall back to a bare shell.
    vendors = [];
  }

  const viewer = await getViewer();

  // getVendorOptions() is already scoped to this person, so [0] is THEIR first
  // showroom rather than the platform's.
  const vendor = vendors[0] ?? null;

  // The sidebar badge, correct on the FIRST paint. Counted here rather than
  // fetched by the browser after mount, because a badge that appears empty and
  // fills in a second later is one a seller learns to distrust — and this is
  // one indexed count, on a promise the shell is already waiting on.
  const unreadLeads = vendor ? await countUnreadLeads(vendor.id) : 0;

  return {
    // The showroom's id, for the live-lead subscription in the shell. Not a
    // secret — RLS is what decides whether a browser holding it can read
    // anything, and the seller's own id is the one thing they may always use.
    id: vendor?.id ?? null,
    name: vendor ? localized(vendor.name, locale) : '',
    slug: vendor?.slug ?? '',
    // The showroom's own logo, for the top of the sidebar. getVendorOptions()
    // already selects it, so this costs nothing extra.
    logoUrl: vendor?.logo_url ?? null,
    verified: Boolean(vendor?.verified),
    // Leads nobody at this showroom has opened yet. See schema.sql §21.3 for
    // why "read" belongs to the showroom rather than to each person in it.
    unreadLeads,
    // The footer used to print a hardcoded "No sign-in yet" under the showroom
    // name, which was true when it was written and became a lie the moment auth
    // landed. It shows the actual account now.
    user: viewer ? viewer.fullName || viewer.email : '',
    email: viewer?.email ?? '',
    avatarUrl: viewer?.avatarUrl ?? null,
    // Drives whether the Catalog link is drawn. Catalog edits SHARED platform
    // data, and the policies refuse a non-staff write — so showing the link to
    // a seller offers a door that does not open.
    isStaff: Boolean(viewer?.isStaff),
  };
}
