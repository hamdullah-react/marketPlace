import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';
import { ArrowRight, ArrowLeft, Info } from 'lucide-react';
import { Card } from '@/components/ui/card';

export const metadata = {
  title: 'Payout runs',
  robots: { index: false, follow: false },
};

/**
 * Payouts — and why this screen has nothing to show.
 *
 * ── An honest page instead of a "coming soon" ───────────────────────────────
 *
 * This was a ComingSoon stub, which promised a feature that is not late — it is
 * not applicable. Paying showrooms out requires having collected from buyers
 * first, and this marketplace never does: a buyer sends a request, the showroom
 * rings them, and the car is paid for at the showroom. `orders` and `payouts`
 * are empty because nothing writes them, and nothing writes them because the
 * platform is not in the payment path.
 *
 * So the page says that, and points at the ledger that does exist. A stub here
 * would have an admin waiting for a payout run that can never be due, and would
 * hide the fact that the money in this business flows the other way.
 *
 * The tables are left in schema.sql untouched. If this marketplace ever takes
 * payment online, this page is where the payout runs belong, and the schema for
 * them is already written.
 */
export default async function AdminFinancePayoutsPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);
  const Arrow = locale === 'ar' ? ArrowLeft : ArrowRight;

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <h1 className="text-2xl font-bold text-brand-primary">
            {t('دفعات البائعين', 'Payout runs')}
          </h1>
        </div>

        <div className="px-4 lg:px-6">
          <Card className="max-w-2xl p-5">
            <p className="flex items-center gap-2 font-semibold text-brand-primary">
              <Info className="h-4 w-4" />
              {t('لا توجد دفعات، ولن توجد بالشكل الحالي', 'There are no payouts to run')}
            </p>

            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {t(
                'الدفع للبائع يعني أن المنصة حصّلت المبلغ من المشتري أولاً. هذا لا يحدث هنا: المشتري يرسل طلباً، يتواصل معه المعرض، ويُدفع ثمن السيارة في المعرض مباشرة. المنصة ليست طرفاً في الدفع، فلا مبالغ محتجزة ولا عمولة تُخصم ولا دفعات تُحوَّل.',
                'Paying a showroom out means the platform collected from the buyer first. That does not happen here: the buyer sends a request, the showroom contacts them, and the car is paid for at the showroom. The platform is not in the payment path — so there is nothing held, no commission deducted and no payout to transfer.'
              )}
            </p>

            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {t(
                'المال الذي يتحرك فعلاً يسير في الاتجاه المعاكس: المعرض يدفع للمنصة مقابل تمييز سيارة. هذا السجل في صفحة المالية.',
                'The money that does move goes the other way: a showroom pays the platform to feature a car. That ledger is on the Finance page.'
              )}
            </p>

            <Link
              href={`/${locale}/marketplace/admin/finance`}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-primary hover:underline"
            >
              {t('الذهاب إلى المالية', 'Go to Finance')}
              <Arrow className="h-4 w-4" />
            </Link>

            <p className="mt-5 border-t pt-3 text-xs text-muted-foreground dark:border-white/10">
              {t(
                'جداول الدفعات موجودة في schema.sql ولم تُحذف. إن بدأت المنصة بتحصيل المدفوعات إلكترونياً، فهذه هي الصفحة التي تنتمي إليها دورات الدفع.',
                'The payout tables are still in schema.sql, untouched. If the platform ever collects payment online, this is the page those runs belong on.'
              )}
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
