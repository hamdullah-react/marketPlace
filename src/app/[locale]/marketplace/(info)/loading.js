import { PageHeadSkeleton, SkeletonLines } from '../_components/Skeletons';

/** About, help and the other written pages, while the content is read. */
export default function InfoLoading() {
  return (
    <main className="mx-auto w-full max-w-[900px] px-4 py-10 sm:px-8">
      <PageHeadSkeleton />
      <div className="mt-8">
        <SkeletonLines count={8} />
      </div>
    </main>
  );
}
