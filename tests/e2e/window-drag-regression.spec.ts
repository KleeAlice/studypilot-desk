import { _electron as electron, expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";


const execFileAsync = promisify(execFile);

test("a slow titlebar drag at the large 120% UI scale only moves the window", async () => {
  test.skip(process.platform !== "win32", "native drag regression uses Windows user32 input");
  test.setTimeout(60_000);
  const dataDir = await mkdtemp(join(tmpdir(), "studypilot-window-drag-"));
  const app = await electron.launch({
    args: ["--no-sandbox", "--disable-gpu-sandbox", `--user-data-dir=${join(dataDir, "electron-profile")}`, "."],
    cwd: resolve("."),
    env: { ...process.env, STUDYPILOT_DATA_DIR: dataDir },
  });

  try {
    const page = await app.firstWindow();
    await expect(page.locator(".titlebar__drag-fill")).toBeVisible({ timeout: 20_000 });
    const runtime = await page.evaluate(() => window.studypilot.runtime());
    const response = await fetch(`${runtime.apiBase}/api/settings/ui_font_scale`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: 1.2 }),
    });
    expect(response.ok).toBe(true);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("style", /--ui-font-scale:\s*1\.2/);
    await expect(page.locator(".titlebar__drag-fill")).toBeVisible();
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.unmaximize();
      win.setBounds({ x: 160, y: 120, width: 1200, height: 826 }, false);
      win.setAlwaysOnTop(true, "screen-saver");
      win.show();
      win.focus();
      win.moveTop();
    });
    await page.waitForTimeout(500);

    const beforeViewport = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    }));
    const start = await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return {
        outer: win.getBounds(),
        content: win.getContentBounds(),
      };
    });
    const dragFill = page.locator(".titlebar__drag-fill");
    const dragBox = await dragFill.boundingBox();
    expect(dragBox).not.toBeNull();
    const displayScaleFactor = await app.evaluate(({ BrowserWindow, screen }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return screen.getDisplayMatching(win.getBounds()).scaleFactor;
    });
    const startX = Math.round((start.outer.x * displayScaleFactor) + ((dragBox!.x + dragBox!.width / 2) * beforeViewport.devicePixelRatio));
    const startY = Math.round((start.outer.y * displayScaleFactor) + ((dragBox!.y + dragBox!.height / 2) * beforeViewport.devicePixelRatio));
    const endX = Math.round(startX + (96 * displayScaleFactor));
    const endY = Math.round(startY + (60 * displayScaleFactor));
    await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy", "Bypass",
      "-File", resolve("scripts/native-window-drag.ps1"),
      "-StartX", String(startX),
      "-StartY", String(startY),
      "-EndX", String(endX),
      "-EndY", String(endY),
      "-Steps", "12",
    ]);
    await page.waitForTimeout(300);

    const final = await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return {
        outer: win.getBounds(),
        content: win.getContentBounds(),
      };
    });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setAlwaysOnTop(false));
    const cursorAfter = await app.evaluate(({ screen }) => screen.getCursorScreenPoint());
    const afterViewport = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    }));
    console.log("[window-drag-regression]", JSON.stringify({ start, final, dragBox, displayScaleFactor, startX, startY, endX, endY, cursorAfter, beforeViewport, afterViewport }));

    expect(final.outer.width).toBe(start.outer.width);
    expect(final.outer.height).toBe(start.outer.height);
    expect(final.content.width).toBe(start.content.width);
    expect(final.content.height).toBe(start.content.height);
    expect(afterViewport).toEqual(beforeViewport);
    expect(Math.abs(final.outer.x - start.outer.x)).toBeGreaterThanOrEqual(60);
    expect(Math.abs(final.outer.y - start.outer.y)).toBeGreaterThanOrEqual(30);
  } finally {
    await app.close().catch(() => undefined);
    await rm(dataDir, { recursive: true, force: true });
  }
});
