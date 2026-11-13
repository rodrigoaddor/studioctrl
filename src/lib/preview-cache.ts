// IndexedDB avoids localStorage's small synchronous quota for image data.
let database: Promise<IDBDatabase> | undefined;
function open() {
  return (database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("studioctrl.previews.v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("frames");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}
export async function readPreview(key: string): Promise<string | undefined> {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const request = db.transaction("frames").objectStore("frames").get(key);
      request.onsuccess = () =>
        resolve(
          typeof request.result === "string" &&
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
  try {
    const db = await open();
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
