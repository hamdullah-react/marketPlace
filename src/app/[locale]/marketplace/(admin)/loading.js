import { PageHeadSkeleton, StatCardsSkeleton, TableSkeleton } from '../_components/Skeletons';

/**
 * What an admin sees the instant they click, instead of the previous page
 * sitting there while the server reads a dozen tables.
 *
 * One fallback for the WHOLE admin group rather than a loading.js per page:
 * every admin page is a heading, sometimes a row of figures, and a table, so a
 * file in each of thirty folders would be the same markup thirty times and a
 * new page would arrive with none.
 *
 * The shell stays: this replaces the layout's children, so the sidebar, the
 * header and the admin's place in the navigation do not flicker.
 */
export default function AdminLoading() {
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
          <TableSkeleton rows={8} cols={5} />
        </div>
      </div>
    </div>
  );
}
