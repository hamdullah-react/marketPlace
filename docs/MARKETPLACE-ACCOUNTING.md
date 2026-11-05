# Marketplace — Vendor Accounting Strategy

Companion to [MARKETPLACE-STRUCTURE.md](MARKETPLACE-STRUCTURE.md) (where code lives) and
[MARKETPLACE-WORKFLOW.md](MARKETPLACE-WORKFLOW.md) (how the system behaves). This one says
**how a showroom knows whether it is making money**, and what Sauda has to store for that
question to have an answer.

Nothing here is built yet. Everything here is specified against the schema as it stands on
2026-11-05, and the SQL belongs in `src/marketplace/db/schema.sql` as **§35 — ACCOUNTING**,
in that one file, idempotent and re-runnable like every section before it.

---

## 0. The answer in one page

A showroom owner asks six questions. Sauda can answer **three** of them today.

| the question | can Sauda answer it? | what is missing |
|---|---|---|
| How many people saw my cars? | yes — `listings.views`, Analytics | — |
| How many buyers contacted me? | yes — `leads`, by stage | — |
| What do I owe the platform? | yes — `vendor_charges`, Billing | — |
| **How much did I make on that car?** | **no** | what the car cost the showroom |
| **Did that promotion pay for itself?** | **no** | what a won lead was worth |
| **Which of my salespeople earns their desk?** | **no** | sale value against `leads.assigned_to` |

The three gaps are the same gap: **Sauda records that a deal happened and never records what
it was worth.** `leads.stage = 'won'` and `listings.state = 'sold_out'` are already there —
two signals, no money attached to either.

So the strategy is not "build accounting software". It is:

1. **Phase 1 — Spend & return.** From data the platform already holds. No vendor input at all.
2. **Phase 2 — The deal book.** One form, two numbers: what the car cost, what it sold for.
   This is where margin, turn, CAC and salesperson performance all come from.
3. **Phase 3 — Costs and reports.** Overheads, a monthly statement, and a CSV their accountant
   can open.
4. **Not Phase 4.** No double-entry ledger, no chart of accounts, no payroll, no bank feeds.
   See §4.

---

## 1. Ground truth: where the money actually moves

This has to be said first, because the schema contains a complete payments engine that will
never see a row.

```mermaid
flowchart LR
  B["Buyer"]
  V["Showroom"]
  P["Sauda"]

  B -- "rings, visits, pays for the car<br/>OFF-PLATFORM, 100% of it" --> V
  V -- "subscription renewal<br/>boost / feature fees" --> P
  P -. "nothing. ever." .-> V
```

| flow | amount | where it is recorded | who sees it |
|---|---|---|---|
| buyer → showroom | the entire value of the business | **nowhere** | nobody |
| showroom → platform | subscription + boosts | `vendor_charges` (+ `charge_payment_proofs`) | seller: Billing; admin: Finance |
| platform → showroom | never happens | `payouts`, `payout_lines` — **dormant** | — |

`orders`, `order_lines`, `payouts`, `payout_lines`, `commission_rules` and `disputes` are
built, correct, and empty. `src/app/[locale]/marketplace/(seller)/seller/payouts/page.js`
already says why, and redirects to Billing. **Leave them alone.** They are the escrow model,
and they switch on the day Sauda takes a buyer's card — not before. Building vendor accounting
*on top of* `orders` would be building on a table that stays at zero rows.

The consequence that drives this whole document: **the platform cannot derive a showroom's
revenue. The showroom has to tell it.** Everything below is designed around making that telling
cheap enough that it actually happens.

---

## 2. What accounting means to a car showroom

Not a trial balance. Five facts per car and four per month:

**Per car (the unit of account — a car *is* the inventory ledger):**

1. What it cost to buy — `cost_basis`
2. What was spent making it sellable — recon, polish, tyres, transport, plates
3. What it sold for, and when
4. How long the money sat in it — `acquired_at` → `sold_at` = **days to sell**
5. Who sold it

**Per month (the showroom, not the car):**

6. Overheads — rent, salaries, the platform, other advertising
7. Gross margin: sales − direct costs
8. Net: gross margin − overheads
9. VAT collected vs VAT paid

A car showroom is an inventory business whose stock is expensive, unique, and perishable in
value. The number an owner loses sleep over is not revenue — it is **capital parked in metal**
and **how long it has been parked**. A listing live for 180 days is not a listing problem; it
is SAR 90,000 that could have turned twice.

That makes **aging a headline figure**, beside revenue rather than behind it. Note it: it is the
one place this design departs from a generic accounting tool, and part of why a car dealer will
use it.

---

## 3. What the database already holds

Worth being precise, because most of the hard parts are done.

| fact | column | note |
|---|---|---|
| asking price | `listings.price` | with `vat_included`, `vat_percentage` (15.00), `currency` ('SAR') |
| sold | `listings.state = 'sold_out'` | a state, no date, no amount |
| listed since | `listings.created_at` | proxy for acquisition — not the same thing (below) |
| demand | `listings.views`, `leads` per listing | the numerator of every return figure |
| the deal | `leads.stage = 'won'`, `leads.assigned_to` | **who** closed it, never **for how much** |
| platform spend | `vendor_charges.amount` by `kind` | `'boost' \| 'subscription' \| 'other'`, `state` `due\|paid\|void` |
| the boost that was bought | `listing_boosts` → `vendor_charges.boost_id` | links spend to a specific car |
| VAT identity | `vendors.vat_number`, `vendors.cr_number` | already collected at onboarding |

Three things follow:

- **VAT is already modelled per listing** (`vat_included` + `vat_percentage`). Any sale record
  must read those two and store the result, not re-derive 15% at report time. A rate is a fact
  about a moment, like `listing_boosts.price` and `vendor_charges.access_days`.
- **Spend is already attributable to a car** through `boost_id → listing_id`. Cost-per-lead per
  car is computable the day Phase 1 ships, with no new tables.
- **`created_at` is not `acquired_at`.** A showroom lists a car days or months after buying it,
  and imports its back catalogue on day one. Days-to-sell measured from `created_at` would
  flatter every old car in the yard. Phase 2 adds the real date and falls back to `created_at`
  only for rows that predate the column.

---

## 4. The decision: how deep to go

Three honest depths. Pick the ceiling deliberately, because each one costs a different amount
of *the vendor's* discipline, which is the scarce resource — not engineering time.

| depth | what the vendor must do | what they get | verdict |
|---|---|---|---|
| **1. Spend & return** | nothing | what they paid us, what it bought, cost per lead | **build** |
| **2. Deal book** | two numbers per car | margin, aging, turn, CAC, per-salesperson | **build** |
| **3. Full books** | every riyal they spend, correctly categorised | P&L, VAT return, ZATCA invoices | **refuse** |

Depth 3 is a trap. Three reasons, in order of force:

1. **Odoo, QuickBooks and Zoho already exist**, their accountant already uses one, and the
   showroom will not maintain a second set of books inside a car marketplace. A ledger kept
   half the time is worse than no ledger: it produces confident wrong totals.
2. **Issuing a tax invoice is a regulated act.** In Saudi Arabia a VAT invoice must clear
   ZATCA e-invoicing (Fatoora) — cryptographic stamping, QR, clearance for B2B. Generating
   something that merely looks like a tax invoice exposes the showroom to a penalty and Sauda
   to the blame. See §9.
3. Every hour spent on journal entries is an hour not spent on the thing no competitor does:
   **tying spend to leads to sales, per car.** That is marketplace data. A general ledger is a
   commodity.

So the ceiling is Depth 2, plus **export** (§10). Sauda becomes the system of record for the
*deal* and hands the accountant a clean file. It never becomes the general ledger.

**Explicit non-goals.** Written down so a future contributor does not helpfully add them:
double-entry journals, chart of accounts, payroll, bank-feed reconciliation, multi-currency
(SAR only — `listings.currency` exists and is always 'SAR'), buyer payments, escrow,
commission capture, depreciation schedules, and anything that prints a document calling itself
a tax invoice.

---

## 5. Who may see what

This is the first thing to settle, because it is the one that cannot be bolted on later.

**A salesperson must not see what the car cost the showroom.** They negotiate against the
buyer; knowing the floor changes how they do it, and in most showrooms the cost is the owner's
business alone. It is also the detail most likely to leave with somebody who is let go.

So §34's capability map gains one entry, and it is the first capability `staff` is refused
outright on the *reading* side:

```js
// src/marketplace/lib/team.js
  /**
   * Cost, margin and the showroom's own books.
   *
   * The only capability a salesperson is refused for READING rather than for
   * acting. Everything else staff cannot do is something that spends money or
   * changes who may get in; this is a number that changes how they sell. A
   * salesperson who knows the floor negotiates to the floor.
   *
   * Their OWN sales are not here — those are `analytics`, which staff keep, so
   * a salesperson still sees what they closed, without seeing what it cost.
   */
  accounting: ['owner', 'manager'],
```

| who | sees sale price | sees cost & margin | may record a sale | may void one |
|---|---|---|---|---|
| owner | yes | yes | yes | yes |
| manager | yes | yes | yes | yes |
| staff | **their own deals only** | **no** | yes — on a lead assigned to them | no |

The split has a consequence the server must honour: **two read paths for one table.** The
staff path selects sale price without the cost columns, exactly as `session.js` keeps
`PROFILE_FULL` and its fallback apart. Filtering in the component is not enough — the cost
would still be sitting in the payload.

Enforcement is the existing triple: `requireVendorCan('accounting')` on the page,
`vendorForAction(wanted, 'accounting')` in every action, `canOpen` in the sidebar, RLS on the
table. Same pattern as §34; no new mechanism.

---

## 6. Schema — §35, in `schema.sql`

Three tables and two columns. Everything is `numeric(12,2)`, SAR, matching `listings.price`.

### 6.1 `listings` — cost on the car itself

```sql
alter table listings add column if not exists cost_basis  numeric(12,2) check (cost_basis >= 0);
alter table listings add column if not exists acquired_at date;
```

On the listing rather than in a side table, because there is exactly one purchase price per car
and a join to find it would be a join on every inventory screen. `null` means "not told us",
which is a different and perfectly valid state from zero — margin is simply unknown for that
car, and the reports say so rather than showing a 100% margin.

`acquired_at` is a `date`, not `timestamptz`: nobody knows the hour they bought a car, and a
timestamp invites a timezone bug in a figure measured in months.

### 6.2 `vendor_listing_costs` — what was spent on one car after buying it

```sql
create table if not exists vendor_listing_costs (
  id         uuid primary key default gen_random_uuid(),
  vendor_id  uuid not null references vendors (id)  on delete cascade,
  listing_id uuid not null references listings (id) on delete cascade,
  kind       text not null check (kind in
               ('recon', 'transport', 'registration', 'insurance', 'commission', 'other')),
  amount     numeric(12,2) not null check (amount >= 0),
  spent_on   date not null default current_date,
  note       text,
  recorded_by text,
  created_at timestamptz not null default now()
);
```

Many rows per car — a car takes a service, two tyres and a polish — which is why this is a
table and `cost_basis` is a column. `on delete cascade` from the listing, unlike most of this
schema: a recon cost is a fact *about a car* and means nothing without it. That is the opposite
call from `vendor_charges.listing_id` (`set null`), and deliberately: **money paid to the
platform survives the car; money spent on the car does not.** The first is a receipt somebody
may dispute in a year; the second is an input to a margin that no longer exists.

### 6.3 `vendor_sales` — the deal book

```sql
create table if not exists vendor_sales (
  id         uuid primary key default gen_random_uuid(),
  vendor_id  uuid not null references vendors (id) on delete cascade,

  -- SET NULL like leads.listing_id, with the same snapshot discipline: the car
  -- may be deleted; the sale is the showroom's accounting history and stays.
  listing_id uuid references listings (id) on delete set null,
  snapshot   jsonb not null default '{}'::jsonb,  -- title, brand, model, year, plate

  -- Which conversation became this deal. The whole point of the column: it is
  -- what turns "we spent 400 on a boost" into "that boost earned 12,000".
  lead_id    uuid references leads (id) on delete set null,

  sold_price numeric(12,2) not null check (sold_price >= 0),

  -- Resolved from listings.vat_percentage / vat_included AT THE SALE and stored.
  -- Same rule as listing_boosts.price: the agreement is recorded at the moment
  -- it was made, and a later edit to the rate must not reprice a past sale.
  vat_rate   numeric(5,2) not null default 15.00,
  vat_amount numeric(12,2) not null default 0 check (vat_amount >= 0),

  -- Frozen at the sale, for the same reason. A recon cost added next month must
  -- not silently change last month's margin after the owner has read it.
  cost_at_sale numeric(12,2),

  sold_at    date not null default current_date,
  sold_by    text,                      -- the member; defaults to leads.assigned_to
  buyer_name text,
  buyer_phone text,
  payment_method text,                  -- cash | transfer | finance | trade_in
  note       text,

  voided_at   timestamptz,
  void_reason text,
  recorded_by text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A voided sale has a reason; a live one does not. The charge_payment_proofs
  -- review-shape rule, applied to a figure somebody will query next quarter.
  constraint vendor_sales_void_shape check ((voided_at is null) = (void_reason is null))
);

-- One live sale per car. A corrected figure is a void plus a new row, never an
-- UPDATE: a margin the owner has already read must not change under them.
create unique index if not exists vendor_sales_one_live_per_listing
  on vendor_sales (listing_id) where voided_at is null and listing_id is not null;
```

The partial unique index is the §34 `vendor_invites_one_open` pattern, and it carries the same
weight: without it, a double-submitted form doubles the month's revenue. A voided row drops out
of the index, so a correction is always possible.

**RLS.** Member-read, scoped by `vendor_id` through `vendor_members`, like every seller table
in §17.2 and §34. Writes are service-role only, through server actions, so the capability check
cannot be bypassed by a crafted PostgREST call. Cost columns are kept from staff in the *query*
(§5), not by RLS — Postgres policies gate rows, not columns, and a column-level policy here
would be a second place for the rule to drift from the capability map.

### 6.4 Invariants, stated so they can be tested

1. A sale with no `cost_at_sale` has **unknown** margin, never zero margin. Reports must count
   those rows separately and say how many they are, or the first month a showroom skips a cost
   it will read a 100% margin and stop trusting the screen.
2. Recording a sale moves `listings.state → 'sold_out'`, and recording it from a lead moves
   `leads.stage → 'won'`. One action, three writes, and the sale is written first: the money is
   the record, the states are its consequences. (Same ordering argument as `acceptInvite()`
   stamping the invitation second — the irrecoverable half goes last.)
3. Voiding a sale does **not** un-sell the car. The showroom says what happened next.
4. `sold_price` is not validated against `listings.price`. Cars sell below ask, and a
   constraint there would block the truthful entry. Report the delta instead; it is one of the
   more useful numbers on the page.
5. Totals come from `vendor_sales`, never from `listings.state = 'sold_out'`. Two sources for
   one figure is the defect that makes a dashboard untrustworthy — the §34 note on status
   columns, applied to money.

---

## 7. The numbers, and exactly how they are computed

Every formula uses only what §6 adds plus what already exists. No estimates, no imputed values.

```
direct cost (car)   = listings.cost_basis + Σ vendor_listing_costs.amount
gross margin (car)  = vendor_sales.sold_price − vendor_sales.vat_amount − cost_at_sale
margin %            = gross margin / (sold_price − vat_amount)
days to sell        = sold_at − coalesce(acquired_at, listings.created_at::date)
days in stock (live)= current_date − coalesce(acquired_at, created_at::date)

platform spend      = Σ vendor_charges.amount where state = 'paid'       (window)
cost per lead       = platform spend / count(leads)                       (window)
cost per sale (CAC) = platform spend / count(vendor_sales not voided)     (window)
boost return        = Σ gross margin of sales whose lead_id arrived while
                      the listing had a live listing_boost
                      ÷ Σ vendor_charges.amount where boost_id is not null

lead → sale rate    = count(vendor_sales with lead_id) / count(leads)
inventory at cost   = Σ direct cost of listings not sold
inventory turn      = count(sales in window) / avg live car count
aging buckets       = live cars by days in stock: 0–30 / 31–60 / 61–90 / 90+
```

Two deliberate choices in there:

- **VAT comes out before margin.** The 15% was never the showroom's money. A "margin" that
  includes output VAT overstates every deal by roughly the whole of a thin one.
- **Boost return is attributed by *when the lead arrived*, not by whether the car was ever
  boosted.** A car boosted in March and sold in August off an organic lead did not earn that
  boost its money back. This is the honest version, it will sometimes report a boost as
  unprofitable, and that is the number's job.

---

## 8. Screens

Four routes, under one nav group. `Settings` now nests Team; `Finance` is the same shape — a
collapsible with the money pages inside it, so Billing stops sitting alone under "Customers".

| route | who | what |
|---|---|---|
| `/seller/billing` | owner (`billing`) | **exists.** What the showroom owes the platform. Unchanged. |
| `/seller/finance` | owner, manager (`accounting`) | the month: sales, margin, spend, aging, cash-in |
| `/seller/finance/sales` | owner, manager; staff see their own | the deal book — the list, and Record a sale |
| `/seller/finance/costs` | owner, manager | per-car costs and monthly overheads |

Where the sale actually gets recorded matters more than the pages:

- **On the lead** — the existing "won" stage gains two fields and becomes the main entry point.
  A salesperson closing a deal is *in the lead*, not in a finance page they cannot open. This
  is the single decision that determines whether the deal book has data in it, so it is Phase
  2's first task, not its last.
- **On the listing** — "Mark sold" asks for the price and the date in the same breath.
- **On the finance page** — for the walk-in that never was a lead.

Three doors, one action, one table.

---

## 9. VAT and ZATCA — where the line is

Saudi VAT is 15% and `listings.vat_percentage` already defaults to it. Two separate obligations
live here and they must not be confused:

**The showroom's VAT, on a car sale.** The showroom is the taxable seller; Sauda is not a party
to it. Sauda will: store `vat_rate` and `vat_amount` on the sale, exclude VAT from margin, and
produce a **VAT summary** — output VAT from sales, input VAT from costs that carry it, per
month, exportable. Sauda will **not** issue the invoice. The summary is explicitly labelled as
a working figure for their accountant, not a filing.

**Sauda's own VAT, on what it charges the showroom.** This is Sauda's obligation and it is
real: a subscription or boost fee is a taxable supply, so `vendor_charges.amount` needs to be
unambiguously VAT-inclusive or VAT-exclusive (today it is neither — the column has no VAT
field), and the showroom needs a compliant tax invoice to reclaim the input VAT. **This is a
platform-side gap, it is a compliance gap rather than a feature gap, and it should be closed
before the vendor-facing work** — a showroom whose accountant cannot find a tax invoice for
SAR 400 of boosts will ask once and then stop paying attention to the Billing page.

Minimum: `vat_amount` and `vat_rate` on `vendor_charges`, `vendors.vat_number` on the document
(already collected), a sequential invoice number (`vendor_charges.ref` already is one —
`CHG-2026-00001`), and a decision on Fatoora clearance taken with an accountant rather than in
code. Out of scope for this document beyond naming it.

---

## 10. Reports and export

The export is not a nice-to-have; it is what makes Depth 2 sufficient and Depth 3 unnecessary.

- **Monthly statement** (screen + print): sales, direct costs, gross margin, platform spend,
  overheads, net. Uses the existing print-hide chrome.
- **Deal book CSV**: one row per sale — date, car, plate, buyer, salesperson, sale price, VAT,
  cost, margin, days to sell, lead source. This is the file their accountant imports.
- **VAT summary CSV**: output and input VAT by month.
- **Inventory valuation CSV**: live cars at direct cost, with aging. The figure a bank asks for.

Built on `vendor_backups`' existing export plumbing rather than a new mechanism, and the cost
columns are omitted for a staff requester — an export is a read, and the §5 rule does not stop
at the screen.

Odoo, for the one dealership that runs it: the CSV is the integration. A live connector is a
second system of record and a support burden, and it is not worth building until more than one
vendor asks for it.

---

## 11. Phasing

| phase | contents | new tables | vendor must | size |
|---|---|---|---|---|
| **1** | Spend & return: platform spend by kind over a window, cost per lead, boost return by lead arrival, on `/seller/finance` | none | nothing | S |
| **2a** | `accounting` capability, `cost_basis`, `acquired_at`, aging buckets, inventory at cost | 0 tables, 2 columns | enter cost per car | S |
| **2b** | `vendor_sales` + the three entry doors + margin, CAC, per-salesperson | 1 | record the sale | M |
| **3** | `vendor_listing_costs`, overheads, monthly statement, four CSVs, VAT summary | 1 | record costs | M |
| **P** | platform-side: VAT on `vendor_charges`, tax invoice | 0 tables, 2 columns | nothing | S, do early |

Phase 1 is worth shipping on its own: it needs no new tables, no vendor behaviour, and it
answers "did that boost pay for itself" — which is the question that sells the next boost.

Phase 2b's success is measured in rows, not in screens. If the deal book is empty after a
month, the entry point is wrong (§8) and no amount of reporting will fix it.

---

## 12. Failure modes

| risk | what it looks like | the guard |
|---|---|---|
| nobody fills it in | empty deal book, dead screens | record from the **lead**; two fields, not a form |
| partial data read as complete | 100% margin on a car with no cost | unknown ≠ zero; count and name the unknowns (§6.4) |
| a cost added late moves last month | owner reads two different margins | `cost_at_sale` frozen on the sale |
| double submit doubles revenue | the month looks great, briefly | partial unique index on live sales per listing |
| staff see the floor | negotiating to cost | `accounting` capability + separate query path |
| two sources for one total | `sold_out` count ≠ sales count | sales come from `vendor_sales`, full stop |
| it drifts into a ledger | journals, accounts, a half-kept second set of books | §4 non-goals, written down |

---

## 13. Decisions needed from the owner

Engineering can proceed on everything above except these:

1. **Does a manager see cost and margin, or only the owner?** Written as owner+manager in §5.
   A family-run showroom will say owner only; a dealership with a GM will say both. It is one
   line in `CAPABILITIES`, and changing it later is free — but the first answer sets what
   people get used to.
2. **Is `vendor_charges.amount` VAT-inclusive today?** Required before §9 can be closed, and it
   is a question about what has already been invoiced, not about code.
3. **Trade-ins.** A part-exchange is two transactions pretending to be one. Phase 2 records the
   cash leg and a note; doing it properly means the traded car entering inventory at an agreed
   value, which is Phase 3 at the earliest. Confirm that the simple version is acceptable
   first — for a Saudi used-car yard it may not be.
