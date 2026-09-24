import Link from 'next/link';
import { BadgeCheck, Car, EyeOff, MessageSquare, Store } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { localized } from '@/marketplace/lib/listing';
import { shortName } from '@/marketplace/lib/review';
import Stars from './Stars';

/**
 * One review, wherever it is being read.
 *
 * The same component on four screens — the storefront, the buyer's account, the
 * showroom's Reviews page and moderation — because a review that looks like a
 * different object on each of them is four things to keep in step. What differs
 * between the screens is what is SHOWN, not how it looks: the car, the showroom
 * and the moderation note are each a prop, and the buttons are children.
 *
 * `hidden` is never decided here. A page that must not show taken-down reviews
 * does not fetch them; this one just labels what it is handed.
 */
export default function ReviewCard({
  review,
  locale = 'ar',
  showCar = true,
  showShop = false,
  showHiddenReason = false,
  replyLabel = null,
  children = null,
  className = '',
}) {
  const t = (ar, en) => (locale === 'ar' ? ar : en);
  const r = review ?? {};

  const car = r.listings ?? null;
  const shop = r.vendors ?? null;
  const cover = Array.isArray(car?.media) ? car.media[0]?.url : null;

  const when = (iso) => {
    if (!iso) return null;
    const at = new Date(iso);
    return Number.isFinite(at.getTime())
      ? at.toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : null;
  };

  return (
    <Card
      className={`p-4 ${r.hidden ? 'ring-1 ring-red-200 dark:ring-red-900/60' : ''} ${className}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Stars value={r.rating} />

        <span className="text-sm font-medium text-brand-primary">
          {shortName(r.buyer_name, t('مشترٍ', 'A buyer'))}
        </span>

        {r.verified_purchase ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:bg-green-950 dark:text-green-400">
            <BadgeCheck className="h-3 w-3" />
            {t('صفقة مؤكدة', 'Confirmed deal')}
          </span>
        ) : null}

        {r.hidden ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-950 dark:text-red-400">
            <EyeOff className="h-3 w-3" />
            {t('مخفي', 'Hidden')}
          </span>
        ) : null}

        <span className="ms-auto text-xs text-muted-foreground">{when(r.created_at)}</span>
      </div>

      {r.body ? (
        <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-gray-800 dark:text-gray-200">
          {r.body}
        </p>
      ) : (
        <p className="mt-3 text-sm italic text-muted-foreground">
          {t('تقييم بلا تعليق.', 'A rating with no comment.')}
        </p>
      )}

      {showHiddenReason && r.hidden && r.hidden_reason ? (
        <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {t('سبب الإخفاء: ', 'Hidden because: ')}
          {r.hidden_reason}
        </p>
      ) : null}

      {(showCar && car) || (showShop && shop) ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          {showCar && car ? (
            <Link
              href={`/${locale}/marketplace/listing/${car.slug}`}
              className="flex items-center gap-2 hover:text-brand-primary"
            >
              {cover ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={cover} alt="" loading="lazy" className="h-8 w-10 rounded object-cover" />
              ) : (
                <Car className="h-4 w-4" />
              )}
              {localized(car.name, locale)}
            </Link>
          ) : null}

          {showShop && shop ? (
            <Link
              href={`/${locale}/marketplace/vendors/${shop.slug}`}
              className="flex items-center gap-1.5 hover:text-brand-primary"
            >
              <Store className="h-3.5 w-3.5" />
              {localized(shop.name, locale)}
            </Link>
          ) : null}
        </div>
      ) : null}

      {r.vendor_reply ? (
        <div className="mt-3 rounded-lg border-s-2 border-brand-primary bg-brand-primary/5 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-brand-primary">
            <MessageSquare className="h-3.5 w-3.5" />
            {replyLabel ?? t('ردّ المعرض', "The showroom's reply")}
            {r.vendor_replied_at ? (
              <span className="font-normal text-muted-foreground">· {when(r.vendor_replied_at)}</span>
            ) : null}
          </p>
          <p className="mt-1 text-sm text-gray-800 dark:text-gray-200">{r.vendor_reply}</p>
        </div>
      ) : null}

      {children ? <div className="mt-3">{children}</div> : null}
    </Card>
  );
}
