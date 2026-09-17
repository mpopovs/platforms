/**
 * Offline copies of the exhibition show page's API data, so a show keeps
 * running — and can even be reloaded — while the internet connection is down.
 *
 * The 3D model and texture files themselves live in the shared IndexedDB
 * cache in lib/texture-cache.ts; this module only stores the small JSON
 * responses that say what to show: the exhibition config (by access token)
 * and each viewer's models + uploaded textures (by viewer id).
 *
 * Every call degrades to a no-op / null if IndexedDB is unavailable (private
 * browsing, storage blocked), so the show still works online without it.
 */

const DB_NAME = 'exhibition-offline-db';
const DB_VERSION = 1;
const SNAPSHOT_STORE = 'snapshots';

/** How long downloaded exhibition content is kept after it was last confirmed in use while online. */
export const EXHIBITION_OFFLINE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

interface SnapshotRecord<T> {
  key: string;
  data: T;
  savedAt: number;
}

export const exhibitionConfigSnapshotKey = (token: string) => `config:${token}`;
export const viewerDataSnapshotKey = (viewerId: string) => `viewer:${viewerId}`;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
        db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'key' }).createIndex('savedAt', 'savedAt', { unique: false });
      }
    };
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest | void): Promise<T | null> {
  try {
    const db = await openDB();
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(SNAPSHOT_STORE, mode);
      const request = run(tx.objectStore(SNAPSHOT_STORE));
      tx.oncomplete = () => {
        db.close();
        resolve(request ? (request.result as T) : null);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch (err) {
    console.warn('[ExhibitionOffline] IndexedDB unavailable:', err);
    return null;
  }
}

export async function saveSnapshot<T>(key: string, data: T): Promise<void> {
  const record: SnapshotRecord<T> = { key, data, savedAt: Date.now() };
  await withStore('readwrite', (store) => store.put(record));
}

export async function loadSnapshot<T>(key: string): Promise<SnapshotRecord<T> | null> {
  return (await withStore<SnapshotRecord<T> | undefined>('readonly', (store) => store.get(key))) ?? null;
}

export async function deleteSnapshot(key: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(key));
}

/** Removes snapshots saved more than `maxAgeMs` ago (e.g. exhibitions no longer shown on this device), except `keepKeys`. */
export async function deleteSnapshotsOlderThan(maxAgeMs: number, keepKeys: Set<string>): Promise<void> {
  await withStore('readwrite', (store) => {
    const cursorRequest = store.index('savedAt').openCursor(IDBKeyRange.upperBound(Date.now() - maxAgeMs));
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      if (!keepKeys.has((cursor.value as SnapshotRecord<unknown>).key)) cursor.delete();
      cursor.continue();
    };
  });
}

/**
 * fetch() that gives up after `timeoutMs`. When the network interface is up
 * but the internet is not, a plain fetch can hang for minutes before failing,
 * which would stall the show's fallback to its offline copies.
 */
export async function fetchWithTimeout(url: string, timeoutMs: number, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
