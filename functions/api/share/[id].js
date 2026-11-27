// GET /api/share/<id>  ->  {"data": "<compact loadout>"}
import { getShare, json } from '../../_shared.js';

export async function onRequestGet({ params, env }) {
  const data = await getShare(env, params.id);
  return data ? json({ data }) : json({ error: 'Loadout link not found' }, 404);
}
