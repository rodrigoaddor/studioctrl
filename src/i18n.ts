import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import ptBR from "./locales/pt-BR.json";

export const languageStorageKey = "studioctrl.language.v1";
export const languages = [
  { code: "en", label: "English" },
  { code: "pt-BR", label: "Português (Brasil)" },
] as const;

function savedLanguage() {
  if (typeof window === "undefined") return "en";
  try {
    const saved = localStorage.getItem(languageStorageKey);
    return languages.some(({ code }) => code === saved) ? saved! : "en";
  } catch {
    return "en";
  }
}

function applyLanguage(language: string) {
  if (typeof document !== "undefined") document.documentElement.lang = language;
  if (typeof window === "undefined") return;
  try { localStorage.setItem(languageStorageKey, language); } catch {
    // Language switching remains available when browser storage is unavailable.
  }
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, "pt-BR": { translation: ptBR } },
  lng: savedLanguage(),
  fallbackLng: "en",
  supportedLngs: ["en", "pt-BR"],
  initAsync: false,
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});
applyLanguage(i18n.language);
i18n.on("languageChanged", applyLanguage);

export const t = i18n.t.bind(i18n);
export default i18n;
