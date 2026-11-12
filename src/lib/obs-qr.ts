import { normalizeUrl } from "./profiles";

export interface ObsQrConnection {
  url: string;
  password: string;
}

/** OBS percent-encodes the password and omits it when authentication is off. */
export function parseObsQr(value: string): ObsQrConnection {
  try {
    const match =
      /^obs(wss?):\/\/(\[[^\]]+\]|[^:/?#@\s]+):(\d+)(?:\/([^?#]*))?$/i.exec(
        value.trim(),
      );
    if (!match || Number(match[3]) < 1 || Number(match[3]) > 65535) {
      throw new Error();
    }
    return {
      url: normalizeUrl(`${match[1].toLowerCase()}://${match[2]}:${match[3]}`),
      password: decodeURIComponent(match[4] ?? ""),
    };
  } catch {
    // Never echo the QR payload: it contains credentials.
    throw new Error(
      "Scan an OBS connection QR code from WebSocket Server Settings.",
    );
  }
}
