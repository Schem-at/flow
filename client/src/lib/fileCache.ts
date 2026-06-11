/**
 * Simple IndexedDB cache for file inputs in the FlowRunner.
 * Persists uploaded files so they survive page refresh.
 */

const DB_NAME = 'flow-file-cache';
const STORE_NAME = 'files';
const DB_VERSION = 1;

interface CachedFile {
  flowId: string;
  inputKey: string;
  name: string;
  type: string;
  data: ArrayBuffer;
  cachedAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: ['flowId', 'inputKey'] });
        store.createIndex('flowId', 'flowId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function cacheFile(flowId: string, inputKey: string, file: File): Promise<void> {
  try {
    const db = await openDB();
    const data = await file.arrayBuffer();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({
      flowId,
      inputKey,
      name: file.name,
      type: file.type,
      data,
      cachedAt: Date.now(),
    } as CachedFile);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
    db.close();
  } catch (e) {
    console.warn('Failed to cache file:', e);
  }
}

export async function getCachedFile(flowId: string, inputKey: string): Promise<File | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get([flowId, inputKey]);
    const result = await new Promise<CachedFile | undefined>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = reject;
    });
    db.close();
    if (!result) return null;
    return new File([result.data], result.name, { type: result.type });
  } catch (e) {
    console.warn('Failed to read cached file:', e);
    return null;
  }
}

export async function clearCachedFiles(flowId: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('flowId');
    const req = index.openCursor(IDBKeyRange.only(flowId));
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
    db.close();
  } catch (e) {
    console.warn('Failed to clear cached files:', e);
  }
}
