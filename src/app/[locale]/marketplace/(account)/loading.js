import { PageHeadSkeleton, TableSkeleton } from '../_components/Skeletons';

/** The account pages — saved cars, requests, orders, addresses — while they load. */
export default function AccountLoading() {
  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-8 lg:px-20 xl:px-28">
      <PageHeadSkeleton />
      <div className="mt-6">
        <TableSkeleton rows={6} cols={4} />
      </div>
    </main>
  );
}
