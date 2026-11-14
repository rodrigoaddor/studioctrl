// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import App from "../src/App";
import i18n, { languageStorageKey } from "../src/i18n";
import en from "../src/locales/en.json";
import ptBR from "../src/locales/pt-BR.json";
import { useStudio } from "../src/context";
import { StudioClient } from "../src/lib/obs";
import { OutputStopDialog } from "../src/components/output-stop-dialog";
import { RemotePreviewDialog } from "../src/components/remote-preview";

vi.mock("../src/context", () => ({ useStudio: vi.fn() }));
const client = new StudioClient();
beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage("en");
  vi.mocked(useStudio).mockReturnValue({ client, ...client.getSnapshot() });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await i18n.changeLanguage("en");
});

it.each([false, true])("switches languages from the shared menu, connected=%s", async (connected) => {
  const disconnect = vi.spyOn(client, "disconnect");
  if (connected) vi.mocked(useStudio).mockReturnValue({
    client, ...client.getSnapshot(), status: "connected", studio: false,
    profile: { id: "1", name: "Main studio", url: "ws://localhost:4455", rememberPassword: false },
  });
  render(<MemoryRouter initialEntries={[connected ? "/studio" : "/"]}><App /></MemoryRouter>);
  const user = userEvent.setup();
  const trigger = screen.getByRole("button", { name: connected ? "OBS actions" : "App actions" });
  await user.click(trigger);
  screen.getByRole("menuitem", { name: "Language" }).focus();
  await user.keyboard("{ArrowRight}");
  expect(screen.getByRole("menuitemradio", { name: "English" })).toHaveAttribute("aria-checked", "true");
  await user.click(screen.getByRole("menuitemradio", { name: "Português (Brasil)" }));
  expect(document.documentElement).toHaveAttribute("lang", "pt-BR");
  expect(localStorage.getItem(languageStorageKey)).toBe("pt-BR");
  expect(screen.getByRole("button", { name: connected ? "Ativar Modo Estúdio" : "Adicionar conexão" })).toBeInTheDocument();
  if (connected) expect(screen.getByTitle("Conectado a Main studio")).toBeInTheDocument();
  expect(disconnect).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: connected ? "Ações do OBS" : "Ações do aplicativo" }));
  screen.getByRole("menuitem", { name: "Idioma" }).focus();
  await user.keyboard("{ArrowRight}");
  expect(screen.getByRole("menuitemradio", { name: "Português (Brasil)" })).toHaveAttribute("aria-checked", "true");
  await user.click(screen.getByRole("menuitemradio", { name: "English" }));
  expect(document.documentElement).toHaveAttribute("lang", "en");
  expect(screen.getByRole("button", { name: connected ? "Enable Studio Mode" : "Add connection" })).toBeInTheDocument();
});

it("saves credentials using stable form fields while Portuguese is selected", async () => {
  await i18n.changeLanguage("pt-BR");
  render(<MemoryRouter><App /></MemoryRouter>);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Adicionar conexão" }));
  await user.type(screen.getByLabelText("Nome da conexão"), "Studio Alpha");
  const password = screen.getByLabelText("Senha salva");
  expect(password).toHaveAttribute("type", "password");
  await user.type(password, "secret");
  await user.click(screen.getByRole("button", { name: "Mostrar senha" }));
  expect(password).toHaveAttribute("type", "text");
  expect(password).toHaveValue("secret");
  await user.click(screen.getByRole("button", { name: "Ocultar senha" }));
  await user.click(screen.getByLabelText("Lembrar senha neste navegador"));
  await user.click(screen.getByRole("button", { name: "Salvar conexão" }));
  expect(JSON.parse(localStorage.getItem("studioctrl.connections.v1")!)).toEqual([
    expect.objectContaining({ name: "Studio Alpha", password: "secret", rememberPassword: true }),
  ]);
});

it("translates output confirmation and remote validation without changing device names", async () => {
  await i18n.changeLanguage("pt-BR");
  const { unmount } = render(<OutputStopDialog output="stream" device="Studio Alpha" disabled={false}
    onStop={vi.fn()} onClose={vi.fn()} onRestoreFocus={vi.fn()} />);
  expect(screen.getByRole("alertdialog")).toHaveAccessibleName("Parar transmissão?");
  expect(screen.getByText("Isso interromperá a transmissão em Studio Alpha.")).toBeInTheDocument();
  unmount();
  render(<RemotePreviewDialog settingsKey="localized-validation" label="Prévia" onSave={vi.fn()} onClose={vi.fn()} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/URL do WebRTC/), "ftp://example.com");
  await user.click(screen.getByRole("button", { name: "Salvar e conectar" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Use uma URL HTTP ou HTTPS sem credenciais incorporadas ou fragmento.");
  await act(() => i18n.changeLanguage("en"));
  expect(screen.getByRole("button", { name: "Save and connect" })).toBeInTheDocument();
});

it("keeps catalog keys and interpolation variables aligned", () => {
  expect(Object.keys(ptBR).sort()).toEqual(Object.keys(en).sort());
  for (const key of Object.keys(en) as (keyof typeof en)[]) {
    expect(en[key]).toBe(key);
    expect(ptBR[key].trim()).not.toBe("");
    expect(ptBR[key].match(/{{[^}]+}}/g)?.sort() ?? []).toEqual(en[key].match(/{{[^}]+}}/g)?.sort() ?? []);
  }
});
