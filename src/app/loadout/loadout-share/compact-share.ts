import { Loadout as DimApiLoadout } from '@destinyitemmanager/dim-api-types';

/**
 * Compact loadout share links for builds without DIM Sync (no dim.gg short links).
 *
 * The loadout is trimmed to what someone else can use (item hashes, not your item instance IDs),
 * deflate-compressed with the browser's built-in CompressionStream, and base64url-encoded:
 *   https://<site>/loadouts?s=<data>
 */

/** URL parameter holding a compact loadout. */
export const COMPACT_LOADOUT_PARAM = 's';

/** Drop fields that are only meaningful to the person sharing (or are just defaults). */
export function trimLoadoutForSharing(loadout: DimApiLoadout): DimApiLoadout {
  const trimItem = ({ id: _id, ...item }: DimApiLoadout['equipped'][number]) => item;
  const trimmed: DimApiLoadout = {
    ...loadout,
    id: '',
    equipped: loadout.equipped.map(trimItem),
    unequipped: loadout.unequipped.map(trimItem),
  };
  delete trimmed.createdAt;
  delete trimmed.lastUpdatedAt;
  if (!trimmed.notes) {
    delete trimmed.notes;
  }
  return trimmed;
}

async function pipe(bytes: Uint8Array, transform: CompressionStream | DecompressionStream) {
  const writer = transform.writable.getWriter();
  void writer.write(bytes as Uint8Array<ArrayBuffer>);
  void writer.close();
  const chunks: Uint8Array[] = [];
  const reader = transform.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function toBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string) {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

type ApiItem = DimApiLoadout['equipped'][number];
const FORMAT_VERSION = 1;

/**
 * Binary layout (then deflate-compressed): the common, number-heavy parts are packed as raw
 * bytes (a 4-byte hash instead of ~10 text digits); anything else rides along as JSON.
 *   version, name, classType, equipped items, unequipped items, mods, extra JSON
 * Each item: hash, number of socket overrides, then (socket index, plug hash) pairs.
 */
class Writer {
  private bytes: number[] = [];
  varint(n: number) {
    while (n > 0x7f) {
      this.bytes.push((n & 0x7f) | 0x80);
      n = Math.floor(n / 128);
    }
    this.bytes.push(n);
  }
  u32(n: number) {
    this.bytes.push((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
  }
  string(text: string) {
    const encoded = new TextEncoder().encode(text);
    this.varint(encoded.length);
    this.bytes.push(...encoded);
  }
  done() {
    return Uint8Array.from(this.bytes);
  }
}

class Reader {
  private pos = 0;
  constructor(private bytes: Uint8Array) {}
  varint() {
    let n = 0;
    let scale = 1;
    for (;;) {
      if (this.pos >= this.bytes.length) {
        throw new Error('Loadout link is cut off');
      }
      const b = this.bytes[this.pos++];
      n += (b & 0x7f) * scale;
      if (b < 0x80) {
        return n;
      }
      scale *= 128;
    }
  }
  u32() {
    if (this.pos + 4 > this.bytes.length) {
      throw new Error('Loadout link is cut off');
    }
    const b = this.bytes;
    const p = this.pos;
    this.pos += 4;
    return ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0;
  }
  string() {
    const length = this.varint();
    const text = new TextDecoder().decode(this.bytes.subarray(this.pos, this.pos + length));
    this.pos += length;
    return text;
  }
}

function writeItems(w: Writer, items: ApiItem[]) {
  w.varint(items.length);
  for (const item of items) {
    w.u32(item.hash);
    const overrides = Object.entries(item.socketOverrides ?? {});
    w.varint(overrides.length);
    for (const [socketIndex, plugHash] of overrides) {
      w.varint(Number(socketIndex));
      w.u32(plugHash);
    }
  }
}

function readItems(r: Reader): ApiItem[] {
  const items: ApiItem[] = [];
  for (let count = r.varint(); count > 0; count--) {
    const item: ApiItem = { hash: r.u32() };
    const overrideCount = r.varint();
    if (overrideCount) {
      item.socketOverrides = {};
      for (let k = 0; k < overrideCount; k++) {
        const socketIndex = r.varint();
        item.socketOverrides[socketIndex] = r.u32();
      }
    }
    items.push(item);
  }
  return items;
}

export async function encodeCompactLoadout(loadout: DimApiLoadout): Promise<string> {
  const {
    name,
    classType,
    equipped,
    unequipped,
    parameters,
    id: _id,
    ...rest
  } = trimLoadoutForSharing(loadout);
  const { mods = [], ...otherParameters } = parameters ?? {};
  const extra: Partial<DimApiLoadout> = { ...rest };
  if (!extra.clearSpace) {
    delete extra.clearSpace;
  }
  if (Object.keys(otherParameters).length) {
    extra.parameters = otherParameters;
  }

  const w = new Writer();
  w.varint(FORMAT_VERSION);
  w.string(name);
  w.varint(classType);
  writeItems(w, equipped);
  writeItems(w, unequipped);
  w.varint(mods.length);
  for (const mod of mods) {
    w.u32(mod);
  }
  w.string(Object.keys(extra).length ? JSON.stringify(extra) : '');
  return toBase64Url(await pipe(w.done(), new CompressionStream('deflate-raw')));
}

export async function decodeCompactLoadout(data: string): Promise<DimApiLoadout> {
  const r = new Reader(await pipe(fromBase64Url(data), new DecompressionStream('deflate-raw')));
  if (r.varint() !== FORMAT_VERSION) {
    throw new Error('This loadout link was made by a newer version of SIM');
  }
  const name = r.string();
  const classType = r.varint();
  const equipped = readItems(r);
  const unequipped = readItems(r);
  const mods: number[] = [];
  for (let count = r.varint(); count > 0; count--) {
    mods.push(r.u32());
  }
  const extraJson = r.string();
  const extra = (extraJson ? JSON.parse(extraJson) : {}) as Partial<DimApiLoadout>;
  const parameters = { ...extra.parameters, ...(mods.length ? { mods } : {}) };
  return {
    clearSpace: false,
    ...extra,
    id: '',
    name,
    classType,
    equipped,
    unequipped,
    ...(Object.keys(parameters).length ? { parameters } : {}),
  };
}

export async function compactLoadoutShareUrl(loadout: DimApiLoadout): Promise<string> {
  return `${window.location.origin}${$PUBLIC_PATH}loadouts?${COMPACT_LOADOUT_PARAM}=${await encodeCompactLoadout(loadout)}`;
}
