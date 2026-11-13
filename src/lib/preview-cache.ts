// IndexedDB avoids localStorage's small synchronous quota for image data.
let database: Promise<IDBDatabase> | undefined;
let generation = 0;
let pendingReset: Promise<void> = Promise.resolve();
function open() {
  return (database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("studioctrl.previews.v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("frames");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}
export async function readPreview(key: string): Promise<string | undefined> {
  const current = generation;
  try {
    await pendingReset;
    const db = await open();
    if (current !== generation) return undefined;
    return await new Promise((resolve, reject) => {
      const request = db.transaction("frames").objectStore("frames").get(key);
      request.onsuccess = () =>
        resolve(
          current === generation && typeof request.result === "string" &&
            /^data:image\/(?:jpeg|jpg);base64,/.test(request.result)
            ? request.result
            : undefined,
        );
      request.onerror = () => reject(request.error);
    });
  } catch {
    return undefined;
  }
}
export async function writePreview(key: string, data: string) {
  const current = generation;
  try {
    await pendingReset;
    const db = await open();
    if (current !== generation) return;
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("frames", "readwrite");
      transaction.objectStore("frames").put(data, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } catch {
    /* Keep the session's in-memory image if storage is unavailable. */
  }
}

export function clearPreviews(keys: string[]): Promise<void> {
  generation++;
  const previous = pendingReset;
  const reset = (async () => {
    await previous;
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("frames", "readwrite");
      const frames = transaction.objectStore("frames");
      keys.forEach((key) => frames.delete(key));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  })();
  pendingReset = reset.catch(() => {});
  return reset;
}
