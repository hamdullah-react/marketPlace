# Marketplace — Corrected Workflow

Companion to [MARKETPLACE-STRUCTURE.md](MARKETPLACE-STRUCTURE.md). That doc says where
code lives; this one says how the system behaves.

This replaces the earlier C2C car-selling flowchart. That diagram modelled **individuals
selling cars by negotiation**. What is being built is a **multi-vendor marketplace** where
sellers list parts, cars, services and accessories — which changes the transaction model,
the money model, and the schema.

---

## 1. What changed, and why

| earlier diagram | corrected | reason |
|---|---|---|
| `Cars` table | `listings` + `type` + `attributes(jsonb)` | one table serves parts, cars, services, accessories |
| individual sellers | `vendors` with storefronts, verification, commission | it's multi-vendor, not C2C |
| offer/negotiation only | three paths, chosen by `listing.type` | a brake pad cannot be bought by negotiation |
| `Payments`, `Subscription` floating | held funds → commission split → payout run | the money path was undefined |
| nothing after `Sold` | dispute state machine | "it never arrived" had no home |
| `Messages` + `Offers` + `Negotiation` | one `inquiries` thread with typed events | three nodes, one concept |
| auth ahead of everything | guest browses, auth gates the action | Googlebot never logs in |

Nothing from the original is lost — the listing lifecycle, admin approval, role dashboards
and review loop were all correct and are carried forward below.

---

## 2. System map

Who talks to what, and where the isolation boundary sits.

```mermaid
flowchart LR
  G["Guest / Googlebot"]
  B["Buyer"]
  V["Vendor"]
  S["Staff"]

  subgraph UI["marketplace/ — own layout, own bundle"]
    BR["(browse) — search, categories, listing, vendor stores"]
    CO["(commerce) — cart, checkout, orders"]
    AC["(account) — saved, inquiries, bookings"]
    SE["(seller) — listings, orders, payouts"]
    AD["(admin) — approvals, moderation, disputes, finance"]
  end

  subgraph API["/api/marketplace/* — own auth, own rate limiter"]
    R["reads"]
    W["server actions — writes"]
  end

  DB2[("DB2 — marketplace only")]
  ODOO[("Odoo / DB1 — the existing site")]

  G --> BR
  B --> BR
  B --> CO
  B --> AC
  V --> SE
  S --> AD

  BR --> R
  CO --> W
  AC --> W
  SE --> W
  AD --> W

  R --> DB2
  W --> DB2
  ODOO -.->|"nightly sync: brands, models, trims"| DB2
```

`ODOO -.-> DB2` is the only line crossing the boundary, it runs on a cron, and it goes one
way. No marketplace page read ever touches the site's database — that is what keeps the two
independently deployable.

---

## 3. Listing lifecycle

Carried over from the original diagram, which had this right. Applies to all four types.

```mermaid
stateDiagram-v2
  [*] --> draft: vendor starts wizard
  draft --> pending_review: submit
  pending_review --> live: staff approves
  pending_review --> rejected: staff rejects with reason
  rejected --> draft: vendor edits
  live --> paused: vendor pauses
  paused --> live: vendor resumes
  live --> pending_review: vendor edits a live listing
  live --> sold_out: stock hits 0, or the car sells
  live --> expired: listing TTL passes
  expired --> pending_review: vendor renews
  live --> removed: staff removes
  removed --> [*]
  sold_out --> [*]
```

Two details the original missed:

- **`live --> pending_review`** — editing a live listing re-enters moderation. Without this
  a vendor gets a cheap listing approved, then edits it into something else.
- **`expired`** — listings must die on their own. A marketplace full of stale ads is the
  single fastest way to lose search trust.

---

## 4. The three transaction paths

**This is the correction that matters.** The type of the listing decides how it is bought.

```mermaid
flowchart TD
  L["Live listing"] --> T{"listing.type"}

  T -->|"part / accessory"| C1["Add to cart"]
  C1 --> C2["Checkout — address, shipping per vendor, pay"]
  C2 --> C3["Split into one order per vendor"]
  C3 --> C4["Vendor accepts → ships → delivered"]

  T -->|"car"| O1["Inquiry or offer"]
  O1 --> O2["Negotiate in one thread"]
  O2 --> O3["Offer accepted"]
  O3 --> O4["Deposit or full payment"]
  O4 --> O5["Handover, ownership transfer"]

  T -->|"service"| S1["Pick a slot"]
  S1 --> S2["Booking requested"]
  S2 --> S3["Vendor confirms"]
  S3 --> S4["Service delivered"]

  C4 --> DONE["Completed"]
  O5 --> DONE
  S4 --> DONE
  DONE --> RV["Verified review"]
  DONE --> PO["Funds released to vendor"]
```

The original flow modelled only the middle branch. All three converge on the same
completion event, which is what makes one reviews table and one payout run possible.

Routes already scaffolded for each branch:

| branch | entry route | action file |
|---|---|---|
| part / accessory | `(commerce)/cart`, `(commerce)/checkout` | `checkout/_actions/place-order.js` |
| car | `(browse)/listing/[slug]` | `listing/[slug]/_actions/inquiry.js` |
| service | `(browse)/listing/[slug]` | `listing/[slug]/_actions/booking.js` |

---

## 5. Money

The largest gap in the original. `Payments` and `Subscription` were nodes with no path
through them.

```mermaid
flowchart LR
  BUY["Buyer pays once"] --> PSP["Payment gateway"]
  PSP --> HELD["Platform held balance"]
  HELD --> WAIT{"Delivery confirmed<br/>or auto-release window passed?"}
  WAIT -->|"no — dispute opened"| D["Dispute"]
  WAIT -->|"yes"| SPLIT{"Split by commission rule"}
  SPLIT -->|"commission %"| REV["Alromaih revenue"]
  SPLIT -->|"net"| VBAL["Vendor balance"]
  VBAL --> RUN["Weekly payout run — staff approves"]
  RUN --> BANK["Vendor IBAN"]
  D -->|"ruled for buyer"| REFUND["Refund from held funds"]
  D -->|"ruled for vendor"| VBAL
```

Three rules this encodes:

1. **The buyer pays once**, even for a cart spanning three vendors. The split happens after
   capture, never at the card.
2. **Funds are held, not forwarded.** Paying a vendor on order-placed makes every refund a
   debt-collection problem.
3. **Commission is computed at capture** and stored on the order. Changing the fee table
   later must not silently reprice historical orders.

---

## 6. Disputes

```mermaid
stateDiagram-v2
  [*] --> open: buyer opens, within the claim window
  open --> vendor_responding: vendor notified, SLA clock starts
  vendor_responding --> resolved: vendor refunds or replaces
  vendor_responding --> escalated: vendor rejects, or SLA expires
  escalated --> staff_review: lands in admin/disputes
  staff_review --> ruled_buyer: refund from held funds
  staff_review --> ruled_vendor: hold released to vendor balance
  resolved --> [*]
  ruled_buyer --> [*]
  ruled_vendor --> [*]
```

The SLA expiry edge is the important one. Without it a vendor closes a dispute by ignoring
it.

---

## 7. Guest vs authenticated

```mermaid
flowchart LR
  G["Guest / Googlebot"] --> BROWSE["Home, category, listing, vendor store"]
  BROWSE --> IDX["200 + JSON-LD — indexable, no login"]
  G --> CART["Add to cart"]
  CART --> LOCAL["Allowed — cart in localStorage"]
  G --> ACT["Checkout, offer, booking, review"]
  ACT --> LOGIN["Sign in"]
  LOGIN --> ACT
```

Every page that should rank is reachable without a session. Auth gates the **action**, not
the content. The original diagram put `Authentication` between the landing page and
everything else — that would have made the whole marketplace invisible to search.

---

## 8. Data model

```mermaid
erDiagram
  vendors ||--o{ listings : sells
  vendors ||--o{ orders : fulfils
  vendors ||--o{ payouts : earns
  categories ||--o{ listings : classifies
  categories ||--o{ categories : nests
  listings ||--o{ order_lines : "bought as"
  listings ||--o{ inquiries : "car and service only"
  listings ||--o{ bookings : "service only"
  orders ||--|{ order_lines : contains
  orders ||--o{ order_events : timeline
  orders ||--o{ disputes : "may raise"
  orders ||--o{ reviews : "verified purchase"
  inquiries ||--o{ inquiry_messages : thread
  buyers ||--o{ orders : places
  buyers ||--o{ reviews : writes
  staff ||--o{ audit_log : writes
```

`orders ||--o{ reviews` rather than `listings ||--o{ reviews` is deliberate: a review must
be anchored to a completed transaction, or the ratings are worthless.

---

## 9. Still open

Decisions this flow assumes but that nobody has actually made yet:

- **Claim window** — how many days a buyer can open a dispute. Drives the auto-release timer.
- **Commission** — flat rate, or per type and category. §5 assumes a rule table either way.
- **Car payments** — does a car transact on-platform at all, or is the marketplace only the
  introduction and the money happens at the branch? This changes whether the `car` branch
  touches the money flow.
- **Vendor onboarding bar** — CR and VAT required for every vendor, or a lighter tier for
  individuals selling one car?
- **Login** — shared with the main site, or separate. See structure doc §6.
