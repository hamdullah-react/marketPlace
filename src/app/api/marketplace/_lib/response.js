/**
 * Every /api/marketplace/* response uses this envelope — one shape for the
 * client to branch on, no thrown errors leaking stack traces.
 */
export function ok(data, init = {}) {
  return Response.json({ ok: true, data, error: null }, { status: 200, ...init });
}

export function fail(message, status = 400, code = null) {
  return Response.json({ ok: false, data: null, error: { message, code } }, { status });
}

export function notImplemented(endpoint) {
  return Response.json(
    { ok: false, data: null, error: { message: `Not implemented yet: ${endpoint}`, code: 'COMING_SOON' } },
    { status: 501 }
  );
}
