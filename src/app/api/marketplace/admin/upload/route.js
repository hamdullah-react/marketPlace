import { getMarketplaceDb } from '@/marketplace/db/client';
import { adminForAction } from '@/marketplace/auth/session';
import { SHARED_BUCKET } from '@/marketplace/media/bucket';
import { ok, fail } from '@/app/api/marketplace/_lib/response';

/**
 * Uploads a website image — logo, favicon, carousel slide, share image, or a
 * picture inside a content page — for Admin → Website content and Settings.
 *
 *   POST /api/marketplace/admin/upload   FormData: file, folder
 *
 * A route handler rather than a server action: an action's request body is
 * capped at 1 MB by default, and a full-width carousel photo is not.
 *
 * Admins only, checked from the session. Files land in the public shared bucket
 * under site/<folder>/, never in a showroom's own bucket.
 */

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon'];
const FOLDERS = ['branding', 'hero', 'seo', 'pages'];

function safeName(name = 'file') {
  const dot = name.lastIndexOf('.');
  const ext = dot > -1 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : 'jpg';
  const stem = (dot > -1 ? name.slice(0, dot) : name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'image';
  return `${stem}.${ext || 'jpg'}`;
}

export async function POST(request) {
  const { error: denied } = await adminForAction();
  if (denied === 'NOT_SIGNED_IN') return fail('Sign in first', 401, denied);
  if (denied) return fail('Only admins can upload website images', 403, denied);

  let form;
  try {
    form = await request.formData();
  } catch {
    return fail('Expected multipart/form-data', 400, 'BAD_REQUEST');
  }

  const file = form.get('file');
  const folder = FOLDERS.includes(form.get('folder')) ? form.get('folder') : 'branding';

  if (!file || typeof file === 'string') return fail('No file supplied', 400, 'NO_FILE');
  if (!ALLOWED.includes(file.type)) return fail(`Unsupported type ${file.type}`, 415, 'BAD_TYPE');
  if (file.size > MAX_BYTES) return fail('File is larger than 8 MB', 413, 'TOO_LARGE');

  try {
    const db = getMarketplaceDb();
    const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const path = `site/${folder}/${stamp}-${safeName(file.name)}`;
    const bytes = Buffer.from(await file.arrayBuffer());

    const { error } = await db.storage
      .from(SHARED_BUCKET)
      .upload(path, bytes, { contentType: file.type, upsert: false });

    if (error) return fail(`Upload failed: ${error.message}`, 500, 'UPLOAD_FAILED');

    const { data } = db.storage.from(SHARED_BUCKET).getPublicUrl(path);
    return ok({ url: data?.publicUrl, path });
  } catch (err) {
    return fail(err.message, 500, 'UPLOAD_FAILED');
  }
}
