import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useRef, useState } from "react";
import { QrCode } from "lucide-react";
import QrScanner from "qr-scanner";
import { parseObsQr, type ObsQrConnection } from "../lib/obs-qr";
import { ErrorNotice } from "./error-notice";
import { Button } from "./ui/button";

export function ScanQrCode({
  onScan,
}: {
  onScan: (connection: ObsQrConnection) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return open ? (
    <QrCapture onScan={onScan} onClose={() => setOpen(false)} />
  ) : (
    <Button
      type="button"
      variant="outline"
      className="mt-4 w-full"
      onClick={() => setOpen(true)}
    >
      <QrCode /> {t("Scan QR Code")}
    </Button>
  );
}

function QrCapture({
  onScan,
  onClose,
}: {
  onScan: (connection: ObsQrConnection) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const video = useRef<HTMLVideoElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const active = useRef(true);
  const [cameraError, setCameraError] = useState(false);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);

  const receive = useCallback(
    (value: string) => {
      if (!active.current) return;
      try {
        const connection = parseObsQr(value);
        active.current = false;
        onScan(connection);
        onClose();
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [onScan, onClose],
  );

  useEffect(() => {
    active.current = true;
    const scanner = new QrScanner(
      video.current!,
      (result) => receive(result.data),
      {
        returnDetailedScanResult: true,
        maxScansPerSecond: 5,
      },
    );
    void scanner.start().catch(() => {
      if (active.current) setCameraError(true);
    });
    return () => {
      active.current = false;
      void scanner.pause(true);
      scanner.destroy();
    };
  }, [receive]);

  async function scanImage(file: File) {
    setReading(true);
    setError("");
    try {
      const result = await QrScanner.scanImage(file, {
        returnDetailedScanResult: true,
      });
      receive(result.data);
    } catch {
      if (active.current)
        setError(
          t("Could not read a QR code. Choose a clear image of the OBS QR code."),
        );
    } finally {
      if (active.current) setReading(false);
    }
  }

  return (
    <section className="mt-4 space-y-2" aria-label={t("Scan OBS QR code")}>
      <div className="relative aspect-video overflow-hidden bg-black">
        <video
          ref={video}
          className="h-full w-full object-contain"
          muted
          playsInline
          aria-label={t("QR scanner camera")}
        />
        {cameraError && (
          <p
            role="status"
            className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-white"
          >{t("Camera unavailable. Allow camera access over HTTPS, or upload a QR image.")}</p>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{t("Point your camera at the OBS QR code, or upload a screenshot.")}</p>
      <input
        ref={input}
        type="file"
        accept="image/*"
        aria-label={t("QR code image")}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void scanImage(file);
        }}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={reading}
          onClick={() => input.current?.click()}
        >
          {reading ? t("Reading image…") : t("Upload QR image")}
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>{t("Cancel scan")}</Button>
      </div>
      {error && <ErrorNotice message={error} onDismiss={() => setError("")} />}
    </section>
  );
}
