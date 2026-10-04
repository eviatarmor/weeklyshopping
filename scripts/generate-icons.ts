/**
 * Renders public/icon.svg to the PNG sizes the PWA manifest needs.
 *
 *   pnpm icons
 */
import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const svg = await readFile("public/icon.svg", "utf8");
const browser = await chromium.launch();
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  // Full-bleed square so the icon also works as "maskable"; the OS applies its own rounding.
  const fullBleed = svg.replace(/rx="\d+"/, 'rx="0"');
  await page.setContent(`<html><body style="margin:0">${fullBleed.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: `public/icon-${size}.png`, omitBackground: true });
  await page.close();
}
await browser.close();
console.log("Wrote public/icon-192.png and public/icon-512.png");
