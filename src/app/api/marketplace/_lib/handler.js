import { ok, fail } from './response';
import { vendorForAction } from '@/marketplace/auth/session';

/**
 * Shared wrapper for every /api/marketplace/* handler.
 *
 * Catches, so a thrown query error becomes a clean {ok:false} envelope instead
 * of a Next.js stack trace, and gives every route the same param parsing rather
 * than each one reinventing `Number(p.get('limit')) || 24`.
 */
export function withApi(fn) {
  return async (request, context) => {
    try {
      const url = new URL(request.url);
      const p = url.searchParams;

      const params = context?.params ? await context.params : {};

      const helpers = {
        p,
        params,
        locale: p.get('locale') === 'en' ? 'en' : 'ar',
        str: (key, fallback = undefined) => p.get(key) || fallback,
        num: (key, fallback = undefined) => {
          const v = p.get(key);
          if (v == null || v === '') return fallback;
          const n = Number(v);
          return Number.isFinite(n) ? n : fallback;
        },
        list: (key) => {
          const v = p.get(key);
          if (!v) return undefined;
          return v.split(',').filter(Boolean);
        },
        bool: (key) => {
          const v = p.get(key);
          return v === '1' || v === 'true';
        },
        // Capped so a client cannot ask for the whole table in one call.
        page: (max = 48, fallbackLimit = 24) => {
          const limit = Math.min(Number(p.get('limit')) || fallbackLimit, max);
          const offset = Math.max(Number(p.get('offset')) || 0, 0);
          return { limit, offset };
        },
        /**
         * The showroom this request may read, from the SESSION.
         *
         * Every seller route took `?vendor=<id>` and passed it straight to the
         * query. Vendor ids are public — /api/marketplace/vendors hands out the
         * whole list to anyone — so that made one showroom's drafts, rejected
         * listings, lead counts and media library readable by anybody who could
         * type a URL. Verified against the running server before this was
         * written; it was not theoretical.
         *
         * The rule is the one media.js already uses for its folder actions: the
         * id is resolved through the caller's memberships, and asking for a
         * showroom that is not yours is refused rather than quietly answered
         * with your own. 404, not 403 — confirming an id belongs to somebody is
         * still an answer about somebody.
         *
         * Returns `{ vendorId }` or `{ error }`, the error already a Response.
         */
        vendor: async (key = 'vendor') => {
          const wanted = p.get(key) || null;
          const { vendorId, error } = await vendorForAction(wanted);

          if (error === 'NOT_SIGNED_IN') return { error: fail('Sign in required', 401, 'NOT_SIGNED_IN') };
          if (error || !vendorId) return { error: fail('Not found', 404, 'NOT_FOUND') };
          if (wanted && vendorId !== wanted) return { error: fail('Not found', 404, 'NOT_FOUND') };

          return { vendorId };
        },

        body: async () => {
          try {
            return await request.json();
          } catch {
            return null;
          }
        },
      };

      return await fn(helpers, request);
    } catch (err) {
      return fail(err.message, 500, 'HANDLER_ERROR');
    }
  };
}

/** Standard list envelope, so every collection route answers the same shape. */
export function list(items, total, { limit, offset }) {
  return ok({
    items,
    total,
    limit,
    offset,
    hasMore: offset + items.length < total,
  });
}

export { ok, fail };
