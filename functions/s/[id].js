// GET /s/<id>  ->  opens the shared loadout in SIM (/loadouts?s=<compact loadout>)
import { getShare } from '../_shared.js';

export async function onRequestGet({ params, env, request }) {
  const data = await getShare(env, params.id);
  const target = new URL(data ? `/loadouts?s=${data}` : '/loadouts', request.url);
  return Response.redirect(target.toString(), 302);
}
