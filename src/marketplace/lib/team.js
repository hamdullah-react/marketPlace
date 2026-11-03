/**
 * What each member of a showroom may do.
 *
 * ── Why this is in code and not in the database ──────────────────────────────
 *
 * schema.sql §34.2 makes the argument and points here. The short version: this
 * map is read by the sidebar deciding what to render, by a page guard before it
 * loads anything, and by every server action before it writes — so on a single
 * dashboard page load it is consulted a dozen times. A permission check that
 * needs a round trip is a permission check somebody caches, and a cached
 * permission is the one that is wrong after a demotion.
 *
 * The database says what ROLE a person holds; `vendor_members` has done that
 * since §17.2. Deciding what that role buys is the application's job, and
 * keeping it in one pure module is what stops the sidebar and the action
 * disagreeing — which is the failure mode that matters, because when they
 * disagree the seller sees a button that returns an error.
 *
 * ── The problem this solves ──────────────────────────────────────────────────
 *
 * `role` was already carried all the way onto `viewer.vendors[]` by session.js
 * and read by NOTHING. Three roles existed in the enum, in the RLS and in the
 * TypeScript types, and all three granted the identical dashboard: a `staff`
 * member could reprice every car, answer every lead, change the showroom's
 * name, and read the bank details on Settings. "Invite a salesperson" meant
 * "hand over the showroom".
 *
 * ── No 'use server', no 'server-only' ────────────────────────────────────────
 *
 * Deliberately importable from a client component: SellerShell is the sidebar
 * and has to know what to draw. Everything here is a pure function over two
 * strings, so there is nothing in it worth hiding — and the ENFORCEMENT is on
 * the server regardless (requireVendorCan in auth/session.js). A client that
 * lied about its role would get a nav it cannot use.
 */

/** The roles, in descending order of what they can do. */
export const TEAM_ROLES = ['owner', 'manager', 'staff'];

export const ROLE_LABELS = {
  owner: { ar: 'مالك', en: 'Owner' },
  manager: { ar: 'مدير', en: 'Manager' },
  staff: { ar: 'موظف', en: 'Staff' },
};

export const ROLE_BLURBS = {
  owner: {
    ar: 'كل شيء، بما في ذلك الاشتراك والفواتير وإدارة الفريق.',
    en: 'Everything, including the subscription, the invoices and the team.',
  },
  manager: {
    ar: 'كل العمل اليومي وإضافة الموظفين. لا يرى الاشتراك ولا الفواتير.',
    en: 'All the day-to-day work, plus adding staff. No subscription, no invoices.',
  },
  staff: {
    ar: 'السيارات والصور والكتالوج والعملاء المحتملون فقط.',
    en: 'Cars, photos, the catalog and leads. Nothing else.',
  },
};

/**
 * capability → the roles that hold it.
 *
 * Grouped by CONSEQUENCE rather than by page, which is why there are seven of
 * these and not one per route. "Can this person spend the showroom's money" is
 * one decision; it governs Promotions today and will govern whatever is added
 * next to the same effect, without anybody having to remember to add a line.
 */
export const CAPABILITIES = {
  /** Cars, photos, the catalog, offers, specs, FAQs — the actual work. */
  listings: ['owner', 'manager', 'staff'],

  /** Leads, the lead form, replying to reviews. The customer conversation. */
  leads: ['owner', 'manager', 'staff'],

  /** The numbers. Read-only, and a salesperson needs to see their own figures. */
  analytics: ['owner', 'manager', 'staff'],

  /**
   * Anything that SPENDS the showroom's money. Boosts raise a vendor_charge on
   * approval, so requesting one is a commitment, not a preference — see the
   * BOOSTS section of schema.sql.
   */
  promotions: ['owner', 'manager'],

  /**
   * The showroom's public identity: its name, logo, banner, About page, social
   * links, SEO and theme. A salesperson must not be able to rename the
   * business, and the damage is visible to every buyer before anybody notices.
   */
  storefront: ['owner', 'manager'],

  /** Who else can get in. See assignableRoles() — a manager cannot mint owners. */
  team: ['owner', 'manager'],

  /**
   * The subscription, the platform's invoices, and recording a payment. Owner
   * only: this is the showroom's relationship with the platform, and the bank
   * details sit on it.
   */
  billing: ['owner'],

  /** Deleting the showroom, exporting and restoring a backup. */
  danger: ['owner'],
};

/** Does this role hold this capability? Unknown role or capability → no. */
export function can(role, capability) {
  const holders = CAPABILITIES[capability];
  return Array.isArray(holders) && holders.includes(role);
}

/**
 * The roles this person may hand out.
 *
 * A manager can invite STAFF and nothing else. Letting a manager mint an owner
 * would make `team` a capability that escalates to every other capability in
 * one step, which is not a permission system — it is a formality. Letting them
 * mint another manager is only a little better: two managers can then promote
 * each other past the owner's knowledge.
 *
 * Returning a list rather than a boolean because the invite form renders from
 * it: a manager sees one option, an owner sees three, and neither is offered a
 * choice the server will refuse.
 */
export function assignableRoles(role) {
  if (role === 'owner') return ['owner', 'manager', 'staff'];
  if (role === 'manager') return ['staff'];
  return [];
}

/**
 * Which capability a dashboard path needs.
 *
 * Longest prefix wins, so `/seller/settings/team` resolves to `team` and not to
 * the `storefront` that `/seller/settings` would give it. Anything unlisted
 * needs nothing beyond membership — the dashboard home, Help, the browse link.
 *
 * Used by the sidebar to hide what a member cannot open, and nothing else: the
 * page guard names its own capability explicitly, because a route table is a
 * list somebody forgets to update when they add a route, and the failure there
 * is silent and in the wrong direction.
 */
const PATH_CAPABILITIES = [
  ['/marketplace/seller/promotions', 'promotions'],
  ['/marketplace/seller/subscription', 'billing'],
  ['/marketplace/seller/billing', 'billing'],
  ['/marketplace/seller/settings/team', 'team'],
  ['/marketplace/seller/settings', 'storefront'],
  ['/marketplace/seller/analytics', 'analytics'],
  ['/marketplace/seller/lead-form', 'leads'],
  ['/marketplace/seller/leads', 'leads'],
  ['/marketplace/seller/reviews', 'leads'],
  ['/marketplace/seller/offers', 'listings'],
  ['/marketplace/seller/media', 'listings'],
  ['/marketplace/seller/catalog', 'listings'],
  ['/marketplace/seller/listings', 'listings'],
];

export function capabilityForPath(path = '') {
  const hit = PATH_CAPABILITIES.find(([prefix]) => path.startsWith(prefix));
  return hit ? hit[1] : null;
}

/** Can this role open this dashboard path? */
export function canOpen(role, path) {
  const needed = capabilityForPath(path);
  return !needed || can(role, needed);
}

/**
 * An invitation's state, DERIVED rather than stored.
 *
 * schema.sql §34.1 keeps three nullable moments and no status column, because
 * a status column and three dates are two answers to one question. This is the
 * one place that turns them into the word a seller reads, so the table and the
 * email cannot describe the same row differently.
 */
export function inviteStatus(invite, now = Date.now()) {
  if (invite?.accepted_at) return 'accepted';
  if (invite?.revoked_at) return 'revoked';
  if (invite?.expires_at && new Date(invite.expires_at).getTime() < now) return 'expired';
  return 'pending';
}

export const INVITE_STATUS_LABELS = {
  pending: { ar: 'بانتظار القبول', en: 'Pending' },
  accepted: { ar: 'مقبولة', en: 'Accepted' },
  revoked: { ar: 'ملغاة', en: 'Revoked' },
  expired: { ar: 'منتهية', en: 'Expired' },
};

/** How long an invitation link stays good. Two weeks — see §34.1. */
export const INVITE_DAYS = 14;
