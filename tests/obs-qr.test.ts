import { expect, it } from "vitest";
import { parseObsQr } from "../src/lib/obs-qr";

it.each([
  ["obsws://192.168.1.10:4455/secret", "ws://192.168.1.10:4455/", "secret"],
  ["obsws://localhost:4455", "ws://localhost:4455/", ""],
  ["obsws://localhost:4455/", "ws://localhost:4455/", ""],
  [
    "obswss://studio.example:443/p%2Fa%25%23%3F%20%C3%A9",
    "wss://studio.example/",
    "p/a%#? é",
  ],
  ["obsws://[::1]:4455/password", "ws://[::1]:4455/", "password"],
])("parses OBS QR connection %s", (value, url, password) => {
  expect(parseObsQr(value)).toEqual({ url, password });
});

it.each([
  "https://example.com:4455/secret",
  "obsws://localhost/secret",
  "obsws://localhost:0/secret",
  "obsws://localhost:65536/secret",
  "obsws://user@localhost:4455/secret",
  "obsws://localhost:4455/%invalid",
  "obsws://localhost:4455/secret#fragment",
  "unrelated QR code",
])("rejects invalid payloads without leaking their contents", (value) => {
  expect(() => parseObsQr(value)).toThrow(
    "Scan an OBS connection QR code from WebSocket Server Settings.",
  );
});
