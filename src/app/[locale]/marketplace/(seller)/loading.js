import { PageHeadSkeleton, StatCardsSkeleton, TableSkeleton } from '../_components/Skeletons';

/**
 * The seller dashboard's instant answer to a click. See (admin)/loading.js for
 * why this is one fallback for the whole group rather than one per page.
 *
 * The sidebar and header belong to the group layout and stay put; only the
 * content area is replaced while the next page is read.
 */
export default function SellerLoading() {
  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <PageHeadSkeleton />
        </div>
        <div className="px-4 lg:px-6">
          <StatCardsSkeleton />
        </div>
        <div className="px-4 lg:px-6">
          <TableSkeleton rows={6} cols={5} />
        </div>
      </div>
    </div>
  );
}
