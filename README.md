# Alromaih Marketplace — standalone

The marketplace, lifted out of `alromaih-web` into its own Next.js project so it can
later run on its own origin (`marketplace.alromaihcars.com`).

**The copy in `alromaih-web` is still there and still live.** This is a second copy, not
a move. Until one is retired, a fix belongs in both.

```
npm run dev      # http://localhost:3001  (3000 is the main site)
```

## Why the routes still say /marketplace

The tree was copied with its `/[locale]/marketplace/...` segment intact, so a file sits at
the same path in both repos and a change can be applied by path. `/`, `/ar` and `/en`
redirect into `/<locale>/marketplace` from `src/proxy.js`.

When this moves to its own subdomain, dropping the segment is the routing change — plus
the one line in `src/proxy.js` (`MARKETPLACE_PATH`) that assumes the prefix.

## What is deliberately different from the parent

| | alromaih-web | here |
|---|---|---|
| root layout | `src/app/layout.js`, hardcoded `lang="ar" dir="rtl"` | `src/app/[locale]/layout.js` — **correct `lang`/`dir` per locale** |
| fonts | 5 families | 2 (Almarai, Noto Sans Arabic) — the only ones the marketplace uses |
| proxy | NextAuth + non-www 301 + `?srsltid` + `/car/` slug rules + Supabase | Supabase session only |
| deps | 81 | 47 |
| Next | 16.2.1 | 16.3.3 |

The root layout moved under `[locale]` on purpose —
`next/dist/docs/01-app/03-api-reference/03-file-conventions/layout.md`: *"The root layout
can be under a dynamic segment ... with `app/[lang]/layout.js`"*. That is what makes the
`lang`/`dir` fix possible; the parent cannot do it because its `<html>` sits above
`[locale]` and cannot see it.

`cacheComponents: true` and `reactCompiler: false` carried over unchanged. The first is
not a performance toggle — the copied queries are written against it (`'use cache'`,
`cacheLife()`, and the rule that `new Date()` must sit inside a cached scope).

## Before this goes to a real subdomain

- `NEXT_PUBLIC_BASE_URL` in `.env.local` is `http://localhost:3001`. It feeds canonicals
  and JSON-LD `@id`s — wrong value, wrong structured data.
- `src/app/[locale]/marketplace/layout.js` sets `robots: { index: false, follow: false }`.
  Inherited from the parent, where it was correct while the catalog was demo data. **A
  public marketplace has to turn this off** or nothing ranks.
- Read `docs/MARKETPLACE-STRUCTURE.md` §0 first. It argues against the subdomain on SEO
  grounds — a new origin starts at near-zero authority, while `/marketplace` on the main
  domain inherits it. That argument has not changed; this project only makes the move
  *possible*, it does not make it *advisable*.

## Shared database

Same DB2 Supabase project as the parent's marketplace — same rows, same storage bucket,
same `MARKETPLACE_*` keys. Two apps, one database: a listing published from either shows
up in both. `src/marketplace/db/schema.sql` is the single source of truth for schema.
