import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(root, "build", "icon.svg");
const outputPath = resolve(root, "build", "icon.png");
const svg = await readFile(sourcePath, "utf8");
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({
    viewport: { width: 1024, height: 1024 },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    `<!doctype html>
    <html>
      <head>
        <style>
          html, body {
            width: 1024px;
            height: 1024px;
            margin: 0;
            overflow: hidden;
            background: transparent;
          }
          svg { display: block; width: 1024px; height: 1024px; }
        </style>
      </head>
      <body>${svg}</body>
    </html>`,
  );
  await page.screenshot({
    path: outputPath,
    omitBackground: true,
  });
  console.log(`[StudyPilot] Rendered ${outputPath}`);
} finally {
  await browser.close();
}
