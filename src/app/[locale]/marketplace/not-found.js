import Link from 'next/link';

export default function MarketplaceNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-5xl font-bold text-brand-primary">404</p>
      <h2 className="text-xl font-bold">الصفحة غير موجودة / Page not found</h2>
      <Link
        href="/marketplace"
        className="raised-solid rounded-lg bg-brand-primary px-6 py-3 text-sm font-medium text-white"
      >
        العودة للسوق / Back to Marketplace
      </Link>
    </div>
  );
}
