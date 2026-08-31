import { getCarFacets } from '@/marketplace/db/queries/cars';
import { withApi, ok } from '@/app/api/marketplace/_lib/handler';

/** GET /api/marketplace/cars/facets — filter options with counts. */
export const GET = withApi(async () => ok(await getCarFacets()));
