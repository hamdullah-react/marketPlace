# Marketplace — Separate App Structure

Multi-vendor marketplace. Sellers list **spare parts**, **cars**, **services** and other
car-related items. Built as a **self-contained app** — its own root layout, own API
namespace, own database, own components, own i18n. Zero imports from the existing site.

---

## Status — scaffolded, all routes live as "Coming Soon"

The skeleton below exists on disk and renders. 75 pages, 7 layouts, 29 API stubs.

- Every route returns 200 with a bilingual `ComingSoon` placeholder (server component —
  zero client JS on unbuilt pages).
- Everything is `noindex, nofollow` until launch, set on the marketplace layout and on
  each page. Flip per-group when going live; keep `(seller)`, `(admin)`, `(account)`
  noindex permanently.
- Every `/api/marketplace/*` stub returns `501` with the `{ ok, data, error }` envelope.
- `_components/`, `_apicalls/`, `_actions/` folders are created empty with a `.gitkeep`
  describing what belongs in each.
- `src/marketplace/db/client.js` and `lib/env.js` are real — the second DB is wired but
  unused until `MARKETPLACE_*` env vars are set.
- The existing site is untouched: `/ar`, `/en`, `/ar/all-cars` verified still 200.

Layout is currently **§7 Option B** (nested layout, root layout untouched). Everything
below describes the finished target.

---

## 0. Read this first — one correction

You said "separate app" for SEO. Separate in **code**: yes, completely — that's what the
rest of this doc builds. Separate in **origin**: no, and this matters.

`marketplace.alromaihcars.com` or a new domain starts at near-zero authority. Google
treats a subdomain as a largely separate site — new listings would crawl slowly and rank
against nothing for months. `www.alromaihcars.com/marketplace` inherits the authority the
main domain already has, and every internal link from an existing car page passes value
straight into it.

So: **one origin, one deployment, two completely independent apps inside it.** You get the
SEO benefit of the established domain and the isolation you want at the same time. The
mechanism is Next.js **multiple root layouts** — confirmed in
`node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md` §"Creating
multiple root layouts": remove the top-level `layout.js`, give each route group its own
`layout.js` with its own `<html>` and `<body>`.

That is a genuinely separate app. Different `<html>`, different fonts, different CSS,
different providers, different JS bundle. Navigating from the site to the marketplace is a
hard navigation — nothing carries over. If you later want it on its own domain, everything
below lifts out unchanged; only the deploy target changes.

---

## 1. What isolation actually buys you

Right now every page on the site loads [src/app/layout.js](src/app/layout.js), which pulls
in **5 Google font families**, `globals.css`, GTM via `TrackingProvider`, `WebVitals`,
`ThemeProvider`, and a pre-hydration polyfill script. That is the shared cost the
marketplace would otherwise inherit on page one.

With its own root layout the marketplace ships:

| | main site | marketplace |
|---|---|---|
| fonts | 5 families | 1–2, subset to what it uses |
| CSS | `globals.css` | own `marketplace.css` |
| providers | Theme + Tracking + WebVitals + Cart | only what it needs |
| tracking | GTM container A | its own container / dataLayer |
| JS bundle | site chunks | zero site chunks |

Route-level code splitting already exists in App Router — the marketplace was never going
to load `MyComponents/HeroSection`. The **root layout is the only real coupling**, and
this removes it.

---

## 2. Four top-level locations

```
src/app/[locale]/marketplace/     ← UI routes + own root layout
src/app/api/marketplace/            ← own API namespace, nothing shared with /api/graphql
src/marketplace/                    ← own lib, db, components, i18n — outside app/
messages/marketplace/               ← own translation files
```

Nothing else in the repo is touched except the root-layout migration in §7.

---

## 3. `src/marketplace/` — the app's own core

Deliberately **outside** `src/app/` so nothing here can be mistaken for a route, and so
the boundary is obvious in imports: anything starting `@/marketplace/…` is marketplace,
anything else is the old site and is off-limits.

```
src/marketplace/
│
├── db/                                    # ── SECOND DATABASE. Only place that touches it
│   ├── client.js                          # marketplaceDb — own Supabase project + env vars
│   ├── schema.sql                         # source of truth for the second DB
│   ├── types.js                           # row shapes as JSDoc typedefs
│   ├── migrations/
│   │   ├── 0001_init.sql                  # vendors, listings, categories
│   │   ├── 0002_orders.sql                # orders, order_lines, order_events
│   │   ├── 0003_reviews.sql
│   │   ├── 0004_disputes_payouts.sql
│   │   └── 0005_audit_log.sql
│   └── queries/                           # every read/write against DB2, one file per table
│       ├── vendors.js
│       ├── listings.js
│       ├── categories.js
│       ├── orders.js
│       ├── reviews.js
│       ├── inquiries.js
│       ├── disputes.js
│       ├── payouts.js
│       └── audit.js
│
├── lib/                                   # pure logic, no React, no DB
│   ├── listing.js                         # normalize, type guards, price/VAT math
│   ├── vendor.js                          # rating rollup, verification tiers, slugs
│   ├── cart.js                            # groupByVendor, per-vendor shipping, totals
│   ├── commission.js                      # fee table per type + category, payout math
│   ├── order-split.js                     # one cart → N orders, one per vendor
│   ├── filters.js                         # facet defs per type, searchParams ⇄ state
│   ├── slugs.js
│   ├── permissions.js                     # isVendor / isAdmin / canEditListing
│   ├── fetcher.js                         # own fetch wrapper for /api/marketplace/*
│   └── env.js                             # validates MARKETPLACE_* env at boot, fails loud
│
├── auth/                                  # own session layer — see §6 on sharing login
│   ├── session.js                         # getMarketplaceSession()
│   ├── guards.js                          # requireVendor(), requireAdmin(), requireUser()
│   └── roles.js
│
├── ui/                                    # own primitives. COPY shadcn in, don't import it
│   ├── button.jsx
│   ├── input.jsx
│   ├── select.jsx
│   ├── dialog.jsx
│   ├── sheet.jsx
│   ├── table.jsx
│   ├── sidebar.jsx
│   ├── badge.jsx
│   ├── tabs.jsx
│   ├── skeleton.jsx
│   ├── toast.jsx
│   └── pagination.jsx
│
├── i18n/
│   ├── request.js                          # own next-intl config, own message loader
│   └── namespaces.js
│
├── seo/
│   ├── metadata.js                        # own generateMetadata builder — NOT lib/seo-config
│   ├── listing-jsonld.js                  # Product / Vehicle / Service per type
│   ├── vendor-jsonld.js                   # LocalBusiness / Store + AggregateRating
│   └── breadcrumbs.js
│
├── styles/
│   └── marketplace.css                    # own Tailwind entry + own CSS vars
│
└── tracking/
    ├── MarketplaceTracking.jsx            # own GTM container, own dataLayer events
    └── events.js
```

**`src/marketplace/ui/` is a copy, not an import.** Copying ~12 shadcn primitives is a few
hundred lines and it buys a hard boundary: the site can restyle `src/components/ui/button.jsx`
tomorrow without touching the marketplace, and vice versa. That is the whole point of the
separation you asked for. Importing them back would re-couple the two apps at the layer
that changes most often.

---

## 4. `src/app/api/marketplace/` — own API namespace

Completely separate from the existing `api/graphql/*`. Different auth, different DB,
different rate limiter.

```
src/app/api/marketplace/
│
├── _lib/                                  # API-only helpers, not routable
│   ├── handler.js                         # withMarketplaceApi() — auth + validation + errors
│   ├── auth.js                            # own API key / session check
│   ├── rate-limit.js                      # own limiter, own buckets
│   ├── validate.js                        # request schema validation
│   └── response.js                        # { ok, data, error } envelope, consistent codes
│
├── listings/
│   ├── route.js                           # GET list (filters, paging)
│   ├── search/route.js                    # GET search + facet counts
│   ├── featured/route.js
│   └── [slug]/
│       ├── route.js                       # GET one
│       └── related/route.js
│
├── vendors/
│   ├── route.js
│   ├── [slug]/route.js
│   └── [slug]/listings/route.js
│
├── categories/
│   ├── route.js                           # tree
│   └── [slug]/route.js
│
├── orders/
│   ├── route.js
│   ├── [id]/route.js
│   └── track/route.js                     # guest tracking by ref + phone
│
├── reviews/route.js
├── inquiries/route.js
│
├── seller/                                # vendor-role gated
│   ├── stats/route.js
│   ├── listings/route.js
│   ├── orders/route.js
│   └── payouts/route.js
│
├── admin/                                 # staff-role gated
│   ├── stats/route.js
│   ├── moderation/route.js
│   ├── vendors/route.js
│   ├── finance/route.js
│   └── audit/route.js
│
├── webhooks/                              # own endpoints, own signature verification
│   ├── payment/route.js
│   └── shipping/route.js
│
└── revalidate/route.js                    # own cache invalidation, own secret
```

**Sync, if you need Odoo data.** If marketplace listings must appear in Odoo (or car data
must appear in the marketplace), do it as a **one-way sync into DB2**, never a live
cross-read. A cron writes into the second DB; the marketplace only ever reads its own
database. That keeps the two apps independently deployable and keeps marketplace page
loads off Odoo's latency.

```
src/app/api/marketplace/sync/
├── odoo-pull/route.js                     # cron: Odoo → DB2 (car reference data, brands, models)
└── odoo-push/route.js                     # cron: DB2 → Odoo (orders for accounting)
```

---

## 5. `src/app/[locale]/marketplace/` — the routes

**A real segment, not a route group.** `(marketplace)` in parentheses would be stripped
from the URL, so `(marketplace)/page.js` resolves to `/ar` — a direct collision with the
existing homepage at `(main)/page.js`. The plain `marketplace` segment gives the correct
`/ar/marketplace/*` URLs, and the isolation comes from its `layout.js`, not from the
parentheses. The nested groups inside it — `(browse)`, `(commerce)`, `(account)`,
`(seller)`, `(admin)`, `(info)` — *do* earn their parentheses: same URL level, six
different layouts.

Every route folder carries its own `_components/`, `_apicalls/`, `_actions/` — open a
folder, see everything that page needs; delete the folder, delete the feature. Per the
Next.js docs, an `_`-prefixed folder opts itself **and all subfolders** out of routing, so
this is safe at any depth.

### 5.1 Root

```
src/app/[locale]/marketplace/
│
├── layout.js                              # the isolation boundary.
│                                          #   TODAY: nested layout (§7 Option B) — sets dir,
│                                          #     imports marketplace.css, noindex until launch
│                                          #   AFTER §7 Option A: own <html>/<body>, own fonts,
│                                          #     own providers, own <head>
├── error.jsx
├── global-error.jsx                       # this app's own global error boundary
├── not-found.js
├── loading.js
├── page.js                                # /marketplace — home
│
├── _providers/
│   ├── MarketplaceProviders.jsx           # single client boundary, all providers in one file
│   ├── CartProvider.jsx                   # OWN cart. Not src/contexts/CartContext.jsx
│   └── SessionProvider.jsx
│
├── _components/                           # only UI used by 3+ routes
│   ├── Header.jsx
│   ├── Footer.jsx
│   ├── CategoryNav.jsx                    # Parts | Cars | Services | Accessories
│   ├── ListingCard.jsx                    # one card; branches on listing.type for price/CTA
│   ├── ListingGrid.jsx
│   ├── VendorBadge.jsx
│   ├── PriceTag.jsx                       # SAR, VAT line, was/now
│   ├── RatingStars.jsx
│   ├── CartDrawer.jsx
│   └── Skeletons.jsx
│
├── _apicalls/                             # reads used by 3+ routes
│   ├── index.js
│   ├── categoryApi.js
│   └── vendorApi.js
│
├── _actions/                              # writes used by 3+ routes
│   ├── cart.js
│   └── wishlist.js
│
└── _home/                                 # home page's own code
    ├── _components/  (HomeHero, CategoryRail, FeaturedListings, TopVendors, SellCta)
    └── _apicalls/homeApi.js
```

### 5.2 Groups

Six nested groups, all flat URLs, six layouts:

| group | chrome | robots | access |
|---|---|---|---|
| `(browse)` | full | index | public |
| `(commerce)` | minimal + step bar | noindex | guest ok |
| `(account)` | side nav | noindex | buyer |
| `(seller)` | dashboard sidebar | noindex except `/sell` | vendor role |
| `(admin)` | admin sidebar | noindex + `X-Robots-Tag` | staff role |
| `(info)` | full | index | public |

```
├── (browse)/
│   ├── layout.js
│   ├── search/
│   │   ├── page.js  loading.js  SearchClient.jsx
│   │   ├── _components/  SearchFilterSidebar, SearchSortBar, ActiveFilterChips, NoResults
│   │   └── _apicalls/searchApi.js
│   ├── c/[...slug]/                       # /marketplace/c/parts/brakes/pads
│   │   ├── page.js  loading.js  CategoryClient.jsx
│   │   ├── _components/  CategoryHeader, SubcategoryChips, CategorySeoBlock
│   │   └── _apicalls/categoryPageApi.js
│   ├── parts/        page.js + _components/ + _apicalls/     # type landing, SEO copy + rails
│   ├── cars/         page.js + _components/ + _apicalls/
│   ├── services/     page.js + _components/ + _apicalls/
│   ├── accessories/  page.js + _components/ + _apicalls/
│   ├── listing/[slug]/
│   │   ├── page.js  loading.js  ListingDetailClient.jsx
│   │   ├── _components/
│   │   │   ├── ListingGallery.jsx
│   │   │   ├── ListingHeader.jsx
│   │   │   ├── ListingActionPanel.jsx     # THE type switch:
│   │   │   │                              #   part/accessory → qty + add to cart
│   │   │   │                              #   car            → inquiry + WhatsApp + test drive
│   │   │   │                              #   service        → slot picker + book
│   │   │   ├── PartSpecsBlock.jsx         # fitment, OEM ref, warranty, stock
│   │   │   ├── CarSpecsBlock.jsx          # mileage, condition, VIN, year, trim
│   │   │   ├── ServiceDetailsBlock.jsx
│   │   │   ├── VendorStrip.jsx
│   │   │   ├── ReviewsSection.jsx
│   │   │   ├── RelatedListings.jsx
│   │   │   └── StickyMobileBar.jsx
│   │   ├── _apicalls/listingDetailApi.js
│   │   └── _actions/  inquiry.js  booking.js  review.js  report.js
│   ├── vendors/
│   │   ├── page.js  VendorsClient.jsx
│   │   ├── _components/  VendorDirectoryCard, VendorFilters
│   │   ├── _apicalls/vendorDirectoryApi.js
│   │   └── [slug]/
│   │       ├── page.js  loading.js  VendorStoreClient.jsx
│   │       ├── _components/  VendorBanner, VendorAboutBlock, VendorPolicies,
│   │       │                 VendorListingGrid, VendorContactCard
│   │       ├── _apicalls/vendorStoreApi.js
│   │       ├── _actions/contact-vendor.js
│   │       └── reviews/  page.js + _components/VendorReviewList.jsx
│   └── compare/  page.js + _components/CompareTable.jsx + _apicalls/
│
├── (commerce)/
│   ├── layout.js                          # minimal header, no category nav
│   ├── _components/  CheckoutSteps, OrderSummaryCard
│   ├── cart/
│   │   ├── page.js  CartClient.jsx
│   │   ├── _components/  VendorCartGroup, CartLineItem, CouponInput, EmptyCart
│   │   ├── _apicalls/cartApi.js           # revalidate price + stock on load
│   │   └── _actions/cart-mutations.js
│   ├── checkout/
│   │   ├── page.js  loading.js  CheckoutClient.jsx
│   │   ├── _components/  AddressStep, ShippingStep, PaymentStep, ReviewStep
│   │   ├── _apicalls/checkoutApi.js
│   │   └── _actions/place-order.js        # cart → N orders sharing parent_ref
│   ├── order-confirmation/  page.js + _components/SubOrderCard.jsx + _apicalls/
│   ├── orders/
│   │   ├── page.js  OrdersClient.jsx + _components/OrderRow.jsx + _apicalls/
│   │   └── [id]/  page.js + _components/{OrderTimeline,OrderItemsTable,OrderActions} + _actions/
│   └── track-order/  page.js + _components/TrackingTimeline.jsx + _apicalls/
│
├── (account)/
│   ├── layout.js                          # side nav + signed-in guard
│   ├── _components/AccountSideNav.jsx
│   └── account/
│       ├── page.js + _components/ + _apicalls/
│       ├── saved/         page.js + _components/SavedTabs.jsx + _actions/
│       ├── inquiries/     page.js + _components/ + _apicalls/ + [id]/(page + _components + _actions)
│       ├── bookings/      page.js + _components/BookingCard.jsx + _actions/
│       ├── addresses/     page.js + _components/AddressForm.jsx + _actions/
│       └── reviews/       page.js + _components/PendingReviewCard.jsx + _actions/
│
├── (seller)/
│   ├── layout.js                          # sidebar + vendor-role guard
│   ├── _components/  SellerSidebar, SellerTopbar, StatCard
│   ├── _apicalls/sellerContextApi.js
│   ├── sell/                              # PUBLIC funnel — only indexed route here
│   │   ├── page.js  SellLandingClient.jsx
│   │   ├── _components/  SellHero, FeeTable, SellerTestimonials, SellFaq
│   │   └── apply/
│   │       ├── page.js  ApplyClient.jsx
│   │       ├── _components/  ApplyStepBusiness, ApplyStepDocuments,
│   │       │                 ApplyStepCategories, ApplyStepPayout
│   │       ├── _actions/apply.js
│   │       └── status/  page.js + _components/ApplicationStatus.jsx
│   └── seller/
│       ├── page.js  DashboardClient.jsx
│       ├── _components/  SalesChart, PendingOrdersWidget, LowStockWidget
│       ├── _apicalls/sellerDashboardApi.js
│       ├── listings/
│       │   ├── page.js  ListingsClient.jsx
│       │   ├── _components/  ListingsTable, ListingStatusBadge, BulkActionsBar
│       │   ├── _apicalls/  _actions/listing-crud.js
│       │   ├── new/
│       │   │   ├── page.js  ListingWizardClient.jsx
│       │   │   ├── _components/
│       │   │   │   ├── WizardTypePicker.jsx        # step 0 — everything after is type-driven
│       │   │   │   ├── WizardBasicInfo.jsx
│       │   │   │   ├── WizardPartFields.jsx        # fitment, OEM, condition
│       │   │   │   ├── WizardCarFields.jsx         # VIN, mileage, year, trim, history
│       │   │   │   ├── WizardServiceFields.jsx     # duration, location, availability
│       │   │   │   ├── WizardMedia.jsx
│       │   │   │   ├── WizardPricing.jsx
│       │   │   │   └── WizardReview.jsx
│       │   │   ├── _apicalls/wizardApi.js
│       │   │   └── _actions/create-listing.js
│       │   └── [id]/  page.js + _actions/update-listing.js + media/(page + _components)
│       ├── orders/     page.js + _components/ + _apicalls/ + [id]/(page + FulfilmentPanel + _actions)
│       ├── inquiries/  page.js + _components/ + _apicalls/ + [id]/
│       ├── bookings/   page.js + _components/BookingCalendar.jsx + _actions/
│       ├── reviews/    page.js + _components/ReviewReplyCard.jsx + _actions/
│       ├── payouts/    page.js + _components/PayoutTable.jsx + _apicalls/
│       └── settings/
│           ├── page.js + _components/StoreProfileForm.jsx + _actions/
│           ├── shipping/  page.js + _components/ShippingZonesEditor.jsx + _actions/
│           ├── policies/  page.js + _actions/
│           └── team/      page.js + _components/TeamTable.jsx + _actions/
│
├── (admin)/
│   ├── layout.js                          # admin sidebar + staff guard + noindex
│   ├── _components/  AdminSidebar, AdminTopbar, AdminDataTable, AdminStatCard, AdminEmptyState
│   ├── _apicalls/adminAuthApi.js
│   └── admin/
│       ├── page.js  AdminDashboardClient.jsx
│       ├── _components/  GmvChart, ModerationQueueWidget, PlatformHealthWidget
│       ├── _apicalls/adminDashboardApi.js
│       ├── vendors/
│       │   ├── page.js + _components/VendorsTable.jsx + _apicalls/
│       │   ├── applications/              # approval queue
│       │   │   ├── page.js
│       │   │   ├── _components/  ApplicationQueue, DocumentViewer   # CR / VAT / ID
│       │   │   └── _actions/vendor-approval.js
│       │   └── [id]/  page.js + _components/{VendorDetailTabs,VendorNotes} + _actions/vendor-admin.js
│       ├── listings/
│       │   ├── page.js + _components/ + _apicalls/ + _actions/listing-moderation.js
│       │   ├── moderation/  page.js + _components/{ModerationQueue,ListingDiffView} + _actions/
│       │   ├── reports/     page.js + _actions/handle-report.js
│       │   └── [id]/        page.js + _components/AdminListingDetail.jsx
│       ├── categories/  page.js + _components/{CategoryTreeEditor,AttributeSchemaEditor} + _actions/
│       ├── orders/      page.js + _components/ + _apicalls/ + [id]/(page + _actions/order-admin.js)
│       ├── disputes/    page.js + _components/DisputeQueue.jsx + _apicalls/
│       │                      + [id]/(page + DisputeThread + _actions/resolve-dispute.js)
│       ├── reviews/     page.js + _components/ + _actions/review-moderation.js
│       ├── finance/
│       │   ├── page.js + _components/FinanceSummary.jsx + _apicalls/
│       │   ├── commissions/  page.js + _components/CommissionRulesEditor.jsx + _actions/
│       │   └── payouts/      page.js + _components/PayoutRunTable.jsx + _actions/
│       ├── customers/   page.js + _components/CustomersTable.jsx + [id]/page.js
│       ├── content/
│       │   ├── banners/   page.js + _components/BannerScheduler.jsx + _actions/
│       │   └── featured/  page.js + _actions/featured.js
│       ├── analytics/   page.js + _components/AnalyticsCharts.jsx + _apicalls/
│       ├── audit-log/   page.js + _components/AuditLogTable.jsx + _apicalls/
│       └── settings/
│           ├── page.js + _components/PlatformSettingsForm.jsx + _actions/
│           ├── staff/     page.js + _components/StaffRolesTable.jsx + _actions/
│           └── policies/  page.js + _actions/
│
└── (info)/
    ├── layout.js + _components/InfoPageShell.jsx
    ├── help/  how-it-works/  buyer-protection/  seller-terms/  fees/     # page.js each
```

**One `listing`, four types.** Everything a seller posts is a listing with a `type`
discriminator — not four parallel sub-apps. One card, one detail route, one search index,
one cart. `type` decides which section blocks render and which fulfilment path applies:
`part`/`accessory` → cart → checkout; `car` → inquiry; `service` → booking.

---

## 6. The second database

```
# .env — marketplace gets its own prefix, its own project, its own keys
MARKETPLACE_SUPABASE_URL=
MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY=
MARKETPLACE_SUPABASE_ANON_KEY=
MARKETPLACE_API_KEY=
MARKETPLACE_GTM_ID=
```

`src/marketplace/db/client.js` mirrors the lazy-init pattern in
[src/lib/supabase.js](src/lib/supabase.js) but exports `marketplaceDb` and reads only
`MARKETPLACE_*` vars. `src/marketplace/lib/env.js` validates them at boot so a missing key
fails loudly at startup instead of on a customer's checkout.

**Hard rule: no cross-database joins.** DB1 (site) and DB2 (marketplace) never appear in
the same query. If the marketplace needs car reference data — brands, models, trims — it
gets a **copy** in DB2, refreshed by the sync cron in §4. Denormalised copies are the price
of independent deployability, and they're worth it.

Core tables in DB2:

```
vendors            id, slug, name_ar, name_en, state, commission_rate, verified,
                   cr_number, vat_number, logo, banner, policies, rating, created_at
listings           id, slug, vendor_id, type, category_id, title_ar/en, description_ar/en,
                   price, vat_included, stock, state, attributes(jsonb), media(jsonb)
categories         id, slug, parent_id, listing_type, name_ar/en, icon, attribute_schema
orders             id, ref, parent_ref, vendor_id, buyer_id, state, totals, address
order_lines        id, order_id, listing_id, qty, unit_price, snapshot(jsonb)
order_events       id, order_id, actor, event, payload, created_at
reviews            id, listing_id, vendor_id, buyer_id, rating, body, verified_purchase
inquiries          id, listing_id, vendor_id, buyer_id, type, state
inquiry_messages   id, inquiry_id, sender, body, created_at
bookings           id, listing_id, vendor_id, buyer_id, slot, state
disputes           id, order_id, opened_by, state, resolution
payouts            id, vendor_id, period, gross, commission, net, state
audit_log          id, actor, action, entity, entity_id, before, after, created_at
```

`attributes(jsonb)` on `listings` is what lets one table serve all four types — the
per-category `attribute_schema` decides which keys are required, so adding a listing type
later is a data change, not a migration.

**Login.** One decision to make: a shared account across site and marketplace, or a
separate one. Shared is better UX and keeps one customer identity; it means
`src/marketplace/auth/session.js` reads the same NextAuth cookie but resolves roles from
DB2. That's the single thread of coupling I'd accept — everything else stays split. If you
want zero coupling, give the marketplace its own auth and accept that buyers sign in twice.

---

## 7. Root-layout migration

This is the one change that touches existing files. From the docs: remove the top-level
`layout.js` and give each route group its own with `<html>` and `<body>`.

**Blocker to handle first.** These currently live outside `[locale]` and depend on
[src/app/layout.js](src/app/layout.js):

- [src/app/callus/page.jsx](src/app/callus/page.jsx) (has its own `layout.jsx`)
- [src/app/compare-cars/page.js](src/app/compare-cars/page.js)
- [src/app/not-found.jsx](src/app/not-found.jsx) and [src/app/global-error.jsx](src/app/global-error.jsx)

Route handlers (`api/`, `sitemap/`, `robots.txt`, `llms.txt`) don't need a root layout and
are unaffected.

**Option A — true split (recommended).**

1. Create `src/app/[locale]/(site)/layout.js` holding everything currently in the root
   layout: fonts, `globals.css`, `ThemeProvider`, `TrackingProvider`, `WebVitals`, polyfill
   script, metadata, `<html>`, `<body>`.
2. Move `(main)`, `(posts)`, `(services)`, `(auth)` under `(site)/`.
3. Write `marketplace/layout.js` with its own `<html>`/`<body>` and its own stack.
4. Move `callus` and `compare-cars` under `(site)`, or give each its own root layout.
5. Delete `src/app/layout.js`. Move `not-found` and `global-error` into each group.

Result: genuinely two apps. Cost: one migration touching ~6 files, and the `not-found`
handling needs care.

**Option B — thin shell (lower risk, ~90% of the benefit).**

Keep `src/app/layout.js` but strip it to a bare `<html><body>{children}</body></html>`.
Move fonts, CSS, providers and tracking **down** into `(site)/layout.js`; the marketplace
layout brings its own. Nothing outside `[locale]` breaks, no `not-found` problem.

What you don't get: the marketplace can't control `<html>` attributes, so `lang`/`dir` stay
computed at the shell. Everything else — fonts, CSS, providers, bundle — is fully split.

**Start with B, move to A once the marketplace is live.** B is reversible in an afternoon
and unblocks the actual build; A is worth doing but not worth blocking on.

---

## 8. Enforcing the boundary

Isolation decays unless something checks it. Add to `.eslintrc`:

```js
// Marketplace may not import from the site
{
  files: ['src/app/[locale]/marketplace/**', 'src/app/api/marketplace/**', 'src/marketplace/**'],
  rules: { 'no-restricted-imports': ['error', { patterns: [
    '@/components/*', '@/MyComponents/*', '@/contexts/*', '@/lib/*',
    '@/utils/*', '@/hooks/*', '@/graphql/*', '@/config/*',
  ]}]},
},
// And the site may not import from the marketplace
{
  files: ['src/app/[locale]/(site)/**', 'src/MyComponents/**', 'src/components/**'],
  rules: { 'no-restricted-imports': ['error', { patterns: ['@/marketplace/*'] }]},
}
```

Allowed exceptions, deliberately narrow: `next/*`, `react`, third-party packages, and —
if you choose shared login — `@/auth`. Everything else is a copy.

---

## 9. SEO, since that's the driver

- **Subpath, not subdomain.** `/marketplace/*` on `www.alromaihcars.com`. §0.
- **Own sitemaps**, added to the existing index:
  `src/app/sitemap/{ar,en}/marketplace-{listings,vendors,categories}.xml/route.js`
- **`generateStaticParams`** on category pages (top 2 levels) and the top ~500 listings so
  the highest-value pages ship as static HTML.
- **JSON-LD per type** — `Product` for parts/accessories, `Vehicle` for cars, `Service` for
  services, `AggregateRating` on vendors, `BreadcrumbList` everywhere.
- **`noindex` on faceted search.** `/marketplace/search?...` with filters must not be
  indexed — it's the classic marketplace crawl-budget sink. Index `/c/[...slug]` category
  pages instead; they're the canonical browse surface.
- **`hreflang` ar/en** on every listing and category page.
- **Own `robots.txt` rules** — `Disallow: /marketplace/seller/`, `/marketplace/admin/`,
  `/marketplace/account/`, `/marketplace/checkout`, `/marketplace/cart`.
- **Canonical on listings** — one listing, one URL. If a listing is reachable from multiple
  categories, the canonical points at `/marketplace/listing/[slug]` only.
- **Own GTM container** so marketplace events don't pollute the dealership's analytics.

---

## 10. Build order

1. **DB2 + core** — `schema.sql`, migrations, `db/client.js`, `db/queries/*`, `lib/env.js`.
   No UI.
2. **API** — `api/marketplace/_lib/handler.js`, then listings / categories / vendors reads.
   Testable with curl before any component exists.
3. **Root layout + shell** — §7 Option B, `marketplace/layout.js`, `marketplace.css`,
   copy the `ui/` primitives.
4. **Browse** — home, `ListingCard`, search, `c/[...slug]`, `listing/[slug]` read-only.
   A shippable catalogue.
5. **Vendors** — directory + storefront.
6. **Admin, first slice** — layout + guard, vendor applications queue, listing moderation.
   Must exist before any real vendor can onboard.
7. **Seller** — `/sell` funnel, apply, dashboard, listing wizard.
8. **Commerce** — cart, checkout with vendor split, confirmation, orders, tracking. Lock
   the `orders`/`order_lines` schema before writing this UI; it's the riskiest piece.
9. **Non-cart paths** — inquiry for `car`, booking for `service`.
10. **Admin, rest** — disputes, finance, payouts, analytics, audit log.
11. **SEO + trust** — reviews, verification badges, JSON-LD, sitemaps, `(info)` pages.

Steps 1–5 give a browsable multi-vendor catalogue that ranks. Step 6 before step 7 matters:
without an approval queue there is no way to let a real vendor in.

---

## 11. Conventions

Inside the marketplace, keep the patterns that already work in this repo — they're good,
they're just re-implemented rather than imported:

- `page.js` is a server component that fetches; the sibling `*Client.jsx` is `"use client"`.
- `loading.js` beside every route that fetches.
- `setRequestLocale(locale)` first line of every page body.
- `_components` / `_actions` / `_apicalls` per route — already started in
  [(main)/loyalty/](src/app/[locale]/(main)/loyalty/).
- `_apicalls/` = reads, plain async functions, no `"use server"`.
  `_actions/` = writes, `"use server"`, and each one must re-check auth server-side
  (a layout guard is UI, not security), validate input, `revalidatePath` on success,
  return `{ ok, data, error }` rather than throw, and write to `audit_log` if under `(admin)`.
- Tailwind classes only — arbitrary values for brand colors and gradients, no `style={{}}`.
- Components stay coarse: one file per meaningful screen with `// ── Section` comments,
  not a deep tree of small wrappers.
- Arabic is `defaultLocale` — RTL-correct by default in every layout, both dashboards included.

**File placement:** most local wins. One page → that page's `_components/`. Page + children
→ parent segment. Whole group → group's `_components/`. Three or more routes → the
marketplace root. Promote only on the third usage — two is a copy, three is a pattern.
