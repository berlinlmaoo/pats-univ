import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AwsClient } from 'aws4fetch';

/**
 * File storage behind one small interface (print files now; flyers, receipts and media later).
 * Keys are plain paths like "cards/batches/<id>/batch.pdf". Nothing here is public: files are
 * served by route handlers that check who is asking.
 *
 *   LocalStorage  files on disk under STORAGE_DIR (a Docker volume in prod)
 *   S3Storage     any S3-compatible bucket (S3, R2, MinIO, …)
 */
export interface Storage {
  put(key: string, body: Uint8Array | string, contentType: string): Promise<void>;
  /** null when the key doesn't exist. */
  get(key: string): Promise<{ body: Uint8Array; contentType: string } | null>;
  remove(key: string): Promise<void>;
  /** Everything under a folder-like prefix ("cards/batches/<id>"). */
  removePrefix(prefix: string): Promise<void>;
}

const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

export function assertKey(key: string): string {
  if (!SAFE_KEY.test(key) || key.includes('..') || key.includes('//')) throw new Error(`Unsafe storage key: ${key}`);
  return key;
}

const TYPES: Record<string, string> = { '.pdf': 'application/pdf', '.csv': 'text/csv; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

/** Content type from the file extension, for drivers that don't keep metadata. */
export function contentTypeFor(key: string): string {
  return TYPES[path.extname(key).toLowerCase()] ?? 'application/octet-stream';
}

export class LocalStorage implements Storage {
  constructor(private readonly root: string) {}

  private file(key: string) {
    return path.join(this.root, assertKey(key));
  }

  async put(key: string, body: Uint8Array | string) {
    const file = this.file(key);
    await mkdir(path.dirname(file), { recursive: true });
    // Write then rename, so a reader never sees half a file.
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, body);
    await rename(tmp, file);
  }

  async get(key: string) {
    const file = this.file(key);
    try {
      await stat(file);
    } catch {
      return null;
    }
    return { body: new Uint8Array(await readFile(file)), contentType: contentTypeFor(key) };
  }

  async remove(key: string) {
    await rm(this.file(key), { force: true });
  }

  async removePrefix(prefix: string) {
    await rm(this.file(prefix), { force: true, recursive: true });
  }
}

export class S3Storage implements Storage {
  private readonly client: AwsClient;

  constructor(
    private readonly endpoint: string,
    private readonly bucket: string,
    accessKeyId: string,
    secretAccessKey: string,
    region: string,
  ) {
    this.client = new AwsClient({ accessKeyId, secretAccessKey, region, service: 's3' });
  }

  /** Path-style URLs work with every S3-compatible server. */
  private url(key: string) {
    return `${this.endpoint.replace(/\/$/, '')}/${this.bucket}/${assertKey(key).split('/').map(encodeURIComponent).join('/')}`;
  }

  async put(key: string, body: Uint8Array | string, contentType: string) {
    const res = await this.client.fetch(this.url(key), { method: 'PUT', body: body as BodyInit, headers: { 'Content-Type': contentType } });
    if (!res.ok) throw new Error(`S3 PUT ${key} failed: ${res.status}`);
  }

  async get(key: string) {
    const res = await this.client.fetch(this.url(key), { method: 'GET' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`S3 GET ${key} failed: ${res.status}`);
    return { body: new Uint8Array(await res.arrayBuffer()), contentType: res.headers.get('content-type') ?? contentTypeFor(key) };
  }

  async remove(key: string) {
    const res = await this.client.fetch(this.url(key), { method: 'DELETE' });
    if (!res.ok && res.status !== 404) throw new Error(`S3 DELETE ${key} failed: ${res.status}`);
  }

  async removePrefix(prefix: string) {
    const base = `${this.endpoint.replace(/\/$/, '')}/${this.bucket}`;
    for (;;) {
      const res = await this.client.fetch(`${base}?list-type=2&prefix=${encodeURIComponent(`${assertKey(prefix)}/`)}`);
      if (!res.ok) throw new Error(`S3 LIST ${prefix} failed: ${res.status}`);
      const keys = [...(await res.text()).matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]!.replace(/&amp;/g, '&'));
      if (keys.length === 0) return;
      for (const key of keys) await this.remove(key);
    }
  }
}
