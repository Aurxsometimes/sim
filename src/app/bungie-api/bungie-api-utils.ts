import { HttpClientConfig, HttpQueryParams } from 'bungie-api-ts/http';

/**
 * Dev builds, and SIM's local install (built without keys), use the keys saved in this
 * browser by the /developer page instead of keys baked into the build.
 */
export const usesStoredKeys = $DIM_FLAVOR === 'dev' || !$DIM_WEB_API_KEY;

export const API_KEY = usesStoredKeys ? localStorage.getItem('apiKey')! : $DIM_WEB_API_KEY;

export function bungieApiUpdate(path: string, data?: Record<string, any>): HttpClientConfig {
  return {
    method: 'POST',
    url: `https://www.bungie.net${path}`,
    body: data,
  };
}

export function bungieApiQuery(path: string, params?: HttpQueryParams): HttpClientConfig {
  return {
    method: 'GET',
    url: `https://www.bungie.net${path}`,
    params,
  };
}

export function oauthClientId(): string {
  return usesStoredKeys ? localStorage.getItem('oauthClientId')! : $DIM_WEB_CLIENT_ID;
}

export function oauthClientSecret(): string {
  return usesStoredKeys ? localStorage.getItem('oauthClientSecret')! : $DIM_WEB_CLIENT_SECRET;
}
