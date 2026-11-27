// POST /api/share  {"data": "<compact loadout>"}  ->  {"id": "aB3dE9xQ"}
import { DATA_PATTERN, idFor, json } from '../../_shared.js';

export async function onRequestPost({ request, env }) {
  if (!env.SHARES) {
    return json({ error: 'Short links are not set up on this site' }, 503);
  }
  // Only SIM's own pages may create links
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) {
    return json({ error: 'Not allowed' }, 403);
  }
  if (Number(request.headers.get('Content-Length') ?? 0) > 8192) {
    return json({ error: 'Too big' }, 413);
  }
  let data;
  try {
    ({ data } = await request.json());
  } catch {
    return json({ error: 'Bad request' }, 400);
  }
  if (typeof data !== 'string' || !DATA_PATTERN.test(data)) {
    return json({ error: 'Not a SIM loadout' }, 400);
  }

  // 8 characters is plenty; on the (very unlikely) chance of a clash, use a longer ID
  for (const length of [8, 12]) {
    const id = await idFor(data, length);
    const existing = await env.SHARES.get(id);
    if (existing === data) {
      return json({ id });
    }
    if (existing === null) {
      await env.SHARES.put(id, data);
      return json({ id });
    }
  }
  return json({ error: 'Could not make a link' }, 500);
}
