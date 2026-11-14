// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

it.each([null, "pt-BR", "fr", "invalid"])("initializes safely from saved language %s", async (saved) => {
  vi.resetModules();
  if (saved) localStorage.setItem("studioctrl.language.v1", saved);
  const { default: i18n } = await import("../src/i18n");
  const expected = saved === "pt-BR" ? "pt-BR" : "en";
  expect(i18n.resolvedLanguage).toBe(expected);
  expect(document.documentElement.lang).toBe(expected);
  expect(i18n.t("Connections")).toBe(expected === "pt-BR" ? "Conexões" : "Connections");
});

it("switches language even when storage reads and writes fail", async () => {
  vi.resetModules();
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("storage unavailable"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage unavailable"); });
  const { default: i18n } = await import("../src/i18n");
  expect(i18n.resolvedLanguage).toBe("en");
  await i18n.changeLanguage("pt-BR");
  expect(i18n.t("Connections")).toBe("Conexões");
  expect(document.documentElement.lang).toBe("pt-BR");
});
