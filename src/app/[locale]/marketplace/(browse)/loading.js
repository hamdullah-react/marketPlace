import { PageHeadSkeleton, ListingGridSkeleton } from '../_components/Skeletons';

/**
 * Browsing is where a stalled click is most visible — a car grid is read from
 * the database on every filter and page, and the cards carry `prefetch={false}`
 * (see ListingCard), so nothing is waiting in the router cache.
 *
 * The header comes from the group layout and stays; this is the page body.
 */
export default function BrowseLoading() {
  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-8 lg:px-20 xl:px-28">
      <PageHeadSkeleton />
      <div className="mt-6">
        <ListingGridSkeleton count={8} />
      </div>
    </main>
  );
}
