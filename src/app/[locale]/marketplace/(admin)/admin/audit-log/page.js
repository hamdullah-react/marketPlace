import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'Audit Log',
  robots: { index: false, follow: false },
};

export default async function AdminAuditLogPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="سجل العمليات"
      titleEn="Audit Log"
      route="/marketplace/admin/audit-log"
    />
  );
}
