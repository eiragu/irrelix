const DB_NAME = 'huabu';
const DB_VERSION = 1;
const STORE_SESSIONS = 'sessions';

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        const store = db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function tx(storeName, mode = 'readonly') {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function makeSessionId() {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function saveSession(session) {
  const store = await tx(STORE_SESSIONS, 'readwrite');
  return wrap(store.put(session));
}

export async function getSession(id) {
  const store = await tx(STORE_SESSIONS);
  return wrap(store.get(id));
}

export async function listSessions() {
  const store = await tx(STORE_SESSIONS);
  const sessions = await wrap(store.getAll());
  return sessions.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteSession(id) {
  const store = await tx(STORE_SESSIONS, 'readwrite');
  return wrap(store.delete(id));
}

export async function estimateStorage() {
  if (!navigator.storage?.estimate) return null;
  const { quota = 0, usage = 0 } = await navigator.storage.estimate();
  return { quota, usage, free: quota - usage };
}

export async function requestPersistent() {
  if (!navigator.storage?.persist) return false;
  return await navigator.storage.persist();
}
