import { afterEach, beforeEach, expect, it, vi } from "vitest";

let frames: Map<string, string>;
let heldReads: (() => void)[];
let holdReads: boolean;
let failTransaction: boolean;
beforeEach(() => {
  vi.resetModules();
  frames = new Map();
  heldReads = [];
  holdReads = false;
  failTransaction = false;
  const db = {
    transaction: () => {
      if (failTransaction) throw new Error("Storage unavailable");
      const tx = {
        oncomplete: undefined as (() => void) | undefined,
        objectStore: () => ({
          put: (data: string, key: string) => frames.set(key, data),
          delete: (key: string) => frames.delete(key),
          get: (key: string) => {
            const request = { result: frames.get(key), onsuccess: undefined as (() => void) | undefined };
            const finish = () => request.onsuccess?.();
            if (holdReads) heldReads.push(finish);
            else queueMicrotask(finish);
            return request;
          },
        }),
      };
      queueMicrotask(() => tx.oncomplete?.());
      return tx;
    },
  };
  vi.stubGlobal("indexedDB", {
    open: () => {
      const request = { result: db, onsuccess: undefined as (() => void) | undefined };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

it("removes the requested saved images while retaining other collections", async () => {
  const { writePreview, readPreview, clearPreviews } = await import("../src/lib/preview-cache");
  await writePreview("scene-a", "data:image/jpeg;base64,a");
  await writePreview("scene-b", "data:image/jpeg;base64,b");
  await writePreview("other-collection", "data:image/jpeg;base64,other");
  expect(await readPreview("scene-a")).toBe("data:image/jpeg;base64,a");
  await clearPreviews(["scene-a", "scene-b"]);
  expect(await readPreview("scene-a")).toBeUndefined();
  expect(await readPreview("scene-b")).toBeUndefined();
  expect(await readPreview("other-collection")).toBe("data:image/jpeg;base64,other");
});

it("discards reads and writes started before reset but allows fresh collection", async () => {
  const { writePreview, readPreview, clearPreviews } = await import("../src/lib/preview-cache");
  await writePreview("scene", "data:image/jpeg;base64,old");
  holdReads = true;
  const oldRead = readPreview("scene");
  await vi.waitFor(() => expect(heldReads).toHaveLength(1));
  const oldWrite = writePreview("scene", "data:image/jpeg;base64,stale");
  const reset = clearPreviews(["scene"]);
  const freshWrite = writePreview("scene", "data:image/jpeg;base64,fresh");
  await Promise.all([oldWrite, reset, freshWrite]);
  heldReads.forEach((finish) => finish());
  expect(await oldRead).toBeUndefined();
  holdReads = false;
  expect(await readPreview("scene")).toBe("data:image/jpeg;base64,fresh");
});

it("reports a failed reset and allows a later retry", async () => {
  const { writePreview, readPreview, clearPreviews } = await import("../src/lib/preview-cache");
  await writePreview("scene", "data:image/jpeg;base64,saved");
  failTransaction = true;
  await expect(clearPreviews(["scene"])).rejects.toThrow("Storage unavailable");
  failTransaction = false;
  await clearPreviews(["scene"]);
  expect(await readPreview("scene")).toBeUndefined();
});
