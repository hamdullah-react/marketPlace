import { PageHeadSkeleton, SkeletonLines } from '../_components/Skeletons';

/** Cart, checkout and order pages, while they are read. */
export default function CommerceLoading() {
  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-8">
      <PageHeadSkeleton />
      <div className="mt-6">
        <SkeletonLines count={6} />
      </div>
    </main>
  );
}
