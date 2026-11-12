import sharp from "sharp";

for (const [filename, size, glyph] of [
  ["pwa-192.png", 192, 132],
  ["pwa-512.png", 512, 352],
  ["pwa-maskable-512.png", 512, 280],
  ["apple-touch-icon.png", 180, 124],
] as const) {
  const icon = await sharp("public/favicon.svg", { density: 1536 })
    .resize(glyph, glyph)
    .png()
    .toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: "#080b0c" },
  })
    .composite([{ input: icon, gravity: "centre" }])
    .png()
    .toFile(`public/${filename}`);
}
