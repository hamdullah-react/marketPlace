'use client';

import { useEffect } from 'react';

export default function MarketplaceError({ error, reset }) {
  useEffect(() => {
    console.error('Marketplace route error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8">
      <h2 className="text-xl font-bold">حدث خطأ ما / Something went wrong</h2>
      <button
        onClick={() => reset()}
        className="rounded-lg bg-brand-primary px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-[#5a2363]"
      >
        إعادة المحاولة / Try Again
      </button>
    </div>
  );
}
