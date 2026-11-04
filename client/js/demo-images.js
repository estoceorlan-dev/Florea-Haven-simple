const DB_NAME = 'florea-demo-media';
const STORE = 'product-images';
let database;
const urls = new Map();

function openDatabase() {
  if (!database) {
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return database;
}

export async function saveDemoProductImage(productId, file) {
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).put(file, productId);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  const oldUrl = urls.get(productId);
  if (oldUrl) URL.revokeObjectURL(oldUrl);
  urls.delete(productId);
}

export async function removeDemoProductImage(productId) {
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).delete(productId);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  const oldUrl = urls.get(productId);
  if (oldUrl) URL.revokeObjectURL(oldUrl);
  urls.delete(productId);
}

export async function getDemoProductImage(productId) {
  if (urls.has(productId)) return urls.get(productId);
  const db = await openDatabase();
  const file = await new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get(productId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  if (!file) return null;
  const url = URL.createObjectURL(file);
  urls.set(productId, url);
  return url;
}
