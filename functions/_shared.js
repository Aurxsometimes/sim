// Shared helpers for SIM's short loadout links (Cloudflare Pages Functions).
// Loadouts are stored in the SHARES KV namespace as SIM's compact loadout data
// (see src/app/loadout/loadout-share/compact-share.ts), keyed by a short ID.

/** Compact loadout data: base64url, and small (a full loadout is ~200 characters) */
export const DATA_PATTERN = /^[A-Za-z0-9_-]{8,4096}$/;
export const ID_PATTERN = /^[A-Za-z0-9_-]{8,12}$/;

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function base64Url(bytes) {
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The same loadout always gets the same ID, so sharing it again doesn't store a copy. */
export async function idFor(data, length) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return base64Url(new Uint8Array(digest)).slice(0, length);
}

export async function getShare(env, id) {
  if (!env.SHARES || !ID_PATTERN.test(id)) {
    return null;
  }
  return env.SHARES.get(id);
}
