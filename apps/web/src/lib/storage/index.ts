import 'server-only';
import path from 'node:path';
import { env } from '../env';
import { LocalStorage, S3Storage, type Storage } from './drivers';

export { assertKey, contentTypeFor, LocalStorage, S3Storage, type Storage } from './drivers';

let instance: Storage | null = null;

export function storage(): Storage {
  if (instance) return instance;
  const e = env();
  instance =
    e.STORAGE_DRIVER === 's3'
      ? new S3Storage(e.S3_ENDPOINT!, e.S3_BUCKET!, e.S3_ACCESS_KEY_ID!, e.S3_SECRET_ACCESS_KEY!, e.S3_REGION)
      : new LocalStorage(path.resolve(e.STORAGE_DIR));
  return instance;
}
