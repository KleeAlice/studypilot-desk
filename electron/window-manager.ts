import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { mkdirSync, renameSync } from "node:fs";
import { screen, type BrowserWindow, type Rectangle } from "electron";


const DEFAULT_BOUNDS: Rectangle = { x: 80, y: 60, width: 1280, height: 820 };

export class WindowStateManager {
  private timer?: NodeJS.Timeout;

  constructor(private readonly statePath: string) {}

  load(): Rectangle {
    try {
      if (!existsSync(this.statePath)) return this.centeredDefault();
      const candidate = JSON.parse(readFileSync(this.statePath, "utf-8")) as Rectangle;
      if (candidate.width < 1100 || candidate.height < 700) return this.centeredDefault();
      const visible = screen.getAllDisplays().some((display) => this.intersects(candidate, display.workArea));
      return visible ? candidate : this.centeredDefault();
    } catch {
      return this.centeredDefault();
    }
  }

  observe(window: BrowserWindow): void {
    const schedule = () => {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.save(window), 180);
    };
    window.on("move", schedule);
    window.on("resize", schedule);
    window.on("close", () => this.save(window));
  }

  private save(window: BrowserWindow): void {
    if (window.isDestroyed() || window.isMaximized() || window.isMinimized()) return;
    const bounds = window.getBounds();
    mkdirSync(dirname(this.statePath), { recursive: true });
    const temporary = `${this.statePath}.tmp`;
    writeFileSync(temporary, JSON.stringify(bounds, null, 2), "utf-8");
    renameSync(temporary, this.statePath);
  }

  private centeredDefault(): Rectangle {
    const work = screen.getPrimaryDisplay().workArea;
    const width = Math.min(DEFAULT_BOUNDS.width, work.width);
    const height = Math.min(DEFAULT_BOUNDS.height, work.height);
    return {
      x: Math.round(work.x + (work.width - width) / 2),
      y: Math.round(work.y + (work.height - height) / 2),
      width,
      height,
    };
  }

  private intersects(left: Rectangle, right: Rectangle): boolean {
    return !(
      left.x + left.width < right.x + 80 ||
      left.x > right.x + right.width - 80 ||
      left.y + left.height < right.y + 40 ||
      left.y > right.y + right.height - 40
    );
  }
}

