/**
 * IndexedDB utility for persistent texture caching
 * Stores texture blobs and metadata to survive browser restarts
 */

const DB_NAME = 'viewer-textures-db';
const DB_VERSION = 1;
const TEXTURE_STORE = 'textures';
const MODEL_STORE = 'models';

export interface CachedTexture {
  url: string;
  blob: Blob;
  timestamp: number;
  modelId: string;
  textureId: string;
  authorName?: string;
  authorAge?: number;
  uploadedAt?: string;
}

export interface CachedModel {
  url: string;
  blob: Blob;
  timestamp: number;
  modelId: string;
}

/**
 * Initialize IndexedDB
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create texture store
      if (!db.objectStoreNames.contains(TEXTURE_STORE)) {
        const textureStore = db.createObjectStore(TEXTURE_STORE, { keyPath: 'url' });
        textureStore.createIndex('modelId', 'modelId', { unique: false });
        textureStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // Create model store
      if (!db.objectStoreNames.contains(MODEL_STORE)) {
        const modelStore = db.createObjectStore(MODEL_STORE, { keyPath: 'url' });
        modelStore.createIndex('modelId', 'modelId', { unique: false });
        modelStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

/**
 * Store texture in IndexedDB
 */
export async function storeTexture(
  url: string,
  blob: Blob,
  modelId: string,
  textureId: string,
  authorName?: string,
  authorAge?: number,
  uploadedAt?: string
): Promise<void> {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([TEXTURE_STORE], 'readwrite');
    const store = transaction.objectStore(TEXTURE_STORE);

    const data: CachedTexture = {
      url,
      blob,
      timestamp: Date.now(),
      modelId,
      textureId,
      authorName,
      authorAge,
      uploadedAt
    };

    const request = store.put(data);

    request.onsuccess = () => {
      console.log('[IndexedDB] Stored texture:', url);
      resolve();
    };
    request.onerror = () => reject(request.error);

    transaction.oncomplete = () => db.close();
  });
}

/**
 * Retrieve texture from IndexedDB
 */
export async function getTexture(url: string): Promise<Blob | null> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([TEXTURE_STORE], 'readonly');
    const store = transaction.objectStore(TEXTURE_STORE);
    const request = store.get(url);

    request.onsuccess = () => {
      const result = request.result as CachedTexture | undefined;
      if (result) {
        console.log('[IndexedDB] Retrieved texture from cache:', url);
        resolve(result.blob);
      } else {
        resolve(null);
      }
    };
    request.onerror = () => reject(request.error);

    transaction.oncomplete = () => db.close();
  });
}

/**
 * Store 3D model in IndexedDB
 */
export async function storeModel(
  url: string,
  blob: Blob,
  modelId: string
): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([MODEL_STORE], 'readwrite');
    const store = transaction.objectStore(MODEL_STORE);

    const data: CachedModel = {
      url,
      blob,
      timestamp: Date.now(),
      modelId
    };

    const request = store.put(data);

    request.onsuccess = () => {
      console.log('[IndexedDB] Stored model:', url);
      resolve();
    };
    request.onerror = () => reject(request.error);

    transaction.oncomplete = () => db.close();
  });
}

/**
 * Retrieve 3D model from IndexedDB
 */
export async function getModel(url: string): Promise<Blob | null> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([MODEL_STORE], 'readonly');
    const store = transaction.objectStore(MODEL_STORE);
    const request = store.get(url);

    request.onsuccess = () => {
      const result = request.result as CachedModel | undefined;
      if (result) {
        console.log('[IndexedDB] Retrieved model from cache:', url);
        resolve(result.blob);
      } else {
        resolve(null);
      }
    };
    request.onerror = () => reject(request.error);

    transaction.oncomplete = () => db.close();
  });
}

/**
 * Get all textures for a specific model
 */
export async function getTexturesForModel(modelId: string): Promise<CachedTexture[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([TEXTURE_STORE], 'readonly');
    const store = transaction.objectStore(TEXTURE_STORE);
    const index = store.index('modelId');
    const request = index.getAll(modelId);

    request.onsuccess = () => {
      resolve(request.result as CachedTexture[]);
    };
    request.onerror = () => reject(request.error);

    transaction.oncomplete = () => db.close();
  });
}

/**
 * Delete old cached items (older than specified days)
 */
export async function cleanOldCache(daysToKeep: number = 7): Promise<void> {
  const db = await openDB();
  const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([TEXTURE_STORE, MODEL_STORE], 'readwrite');

    // Clean textures
    const textureStore = transaction.objectStore(TEXTURE_STORE);
    const textureIndex = textureStore.index('timestamp');
    const textureRequest = textureIndex.openCursor(IDBKeyRange.upperBound(cutoffTime));

    textureRequest.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        console.log('[IndexedDB] Deleting old texture:', cursor.value.url);
        cursor.delete();
        cursor.continue();
      }
    };

    // Clean models
    const modelStore = transaction.objectStore(MODEL_STORE);
    const modelIndex = modelStore.index('timestamp');
    const modelRequest = modelIndex.openCursor(IDBKeyRange.upperBound(cutoffTime));

    modelRequest.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        console.log('[IndexedDB] Deleting old model:', cursor.value.url);
        cursor.delete();
        cursor.continue();
      }
    };

    transaction.oncomplete = () => {
      console.log('[IndexedDB] Cleanup complete');
      db.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Clear all cached data
 */
export async function clearAllCache(): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([TEXTURE_STORE, MODEL_STORE], 'readwrite');

    transaction.objectStore(TEXTURE_STORE).clear();
    transaction.objectStore(MODEL_STORE).clear();

    transaction.oncomplete = () => {
      console.log('[IndexedDB] All cache cleared');
      db.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  textureCount: number;
  modelCount: number;
  totalSize: number;
}> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([TEXTURE_STORE, MODEL_STORE], 'readonly');
    let textureCount = 0;
    let modelCount = 0;
    let totalSize = 0;

    // Count textures
    const textureStore = transaction.objectStore(TEXTURE_STORE);
    const textureCountRequest = textureStore.count();
    textureCountRequest.onsuccess = () => {
      textureCount = textureCountRequest.result;
    };

    // Count models
    const modelStore = transaction.objectStore(MODEL_STORE);
    const modelCountRequest = modelStore.count();
    modelCountRequest.onsuccess = () => {
      modelCount = modelCountRequest.result;
    };

    // Calculate total size (approximate)
    const allTexturesRequest = textureStore.getAll();
    allTexturesRequest.onsuccess = () => {
      const textures = allTexturesRequest.result as CachedTexture[];
      textures.forEach(t => totalSize += t.blob.size);
    };

    const allModelsRequest = modelStore.getAll();
    allModelsRequest.onsuccess = () => {
      const models = allModelsRequest.result as CachedModel[];
      models.forEach(m => totalSize += m.blob.size);
    };

    transaction.oncomplete = () => {
      db.close();
      resolve({ textureCount, modelCount, totalSize });
    };
    transaction.onerror = () => reject(transaction.error);
  });
}
