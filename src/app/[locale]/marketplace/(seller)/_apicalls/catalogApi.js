import { marketplaceApi } from '@/marketplace/lib/api';

/**
 * Client-side catalog reads for the seller form.
 *
 * Thin wrappers over the shared API client, kept here so the form imports from
 * its own `_apicalls` rather than reaching across the tree — and so a component
 * never contains a bare `fetch('/api/…')` string.
 */

export const fetchModels = (brandId, signal) =>
  brandId ? marketplaceApi.models(brandId, { signal }).then((d) => d.items ?? []) : Promise.resolve([]);

export const fetchTrims = (modelId, signal) =>
  modelId ? marketplaceApi.trims(modelId, { signal }).then((d) => d.items ?? []) : Promise.resolve([]);

export const fetchAttributes = (kind, signal) =>
  marketplaceApi.attributes(kind, { signal }).then((d) => (kind ? d.items ?? [] : d.groups ?? {}));

export const fetchMedia = (vendorId, kind, signal) =>
  vendorId ? marketplaceApi.media(vendorId, { kind }, { signal }).then((d) => d.items ?? []) : Promise.resolve([]);

/** Returns the row whether it was created or matched an existing entry. */
export const createCatalogEntry = (payload) =>
  marketplaceApi.createCatalogEntry(payload).then((d) => ({ item: d.item, created: d.created }));

export const uploadMedia = (file, opts) => marketplaceApi.upload(file, opts);
export const deleteMedia = (id) => marketplaceApi.deleteMedia(id);
