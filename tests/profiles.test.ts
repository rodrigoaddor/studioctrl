// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest";
import { loadProfiles, normalizeUrl, saveProfiles } from "../src/lib/profiles";
beforeEach(() => localStorage.clear());
it("never persists a password without the remember option", () => {
  saveProfiles([
    {
      id: "1",
      name: "Studio",
      url: "ws://localhost:4455",
      rememberPassword: false,
      password: "not-for-storage",
    },
  ]);
  expect(localStorage.getItem("studioctrl.connections.v1")).not.toContain(
    "not-for-storage",
  );
  expect(loadProfiles()[0].password).toBeUndefined();
});
it("persists remembered credentials and removes them when opted out", () => {
  const p = {
    id: "1",
    name: "Studio",
    url: "ws://localhost:4455",
    rememberPassword: true,
    password: "remember-me",
  };
  saveProfiles([p]);
  expect(loadProfiles()[0].password).toBe("remember-me");
  saveProfiles([{ ...p, rememberPassword: false }]);
  expect(loadProfiles()[0].password).toBeUndefined();
});
it("handles corrupt storage and rejects addresses containing credentials", () => {
  localStorage.setItem("studioctrl.connections.v1", "{broken");
  expect(loadProfiles()).toEqual([]);
  expect(() => normalizeUrl("https://example.com")).toThrow();
  expect(() => normalizeUrl("ws://user:secret@localhost:4455")).toThrow();
  expect(normalizeUrl("wss://obs.example.com")).toBe("wss://obs.example.com/");
});
