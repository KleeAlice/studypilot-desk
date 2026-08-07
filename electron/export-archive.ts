import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, extname, isAbsolute, join } from "node:path";


export class ExportArchive {
  readonly defaultDirectory: string;
  private readonly preferencePath: string;

  constructor(private readonly dataDir: string) {
    this.defaultDirectory = join(dataDir, "exports");
    this.preferencePath = join(dataDir, "export-directory.json");
  }

  async getDirectory(): Promise<string> {
    try {
      const parsed = JSON.parse(await readFile(this.preferencePath, "utf8"));
      return typeof parsed?.directory === "string" && isAbsolute(parsed.directory)
        ? parsed.directory
        : this.defaultDirectory;
    } catch {
      return this.defaultDirectory;
    }
  }

  async setDirectory(directory: string): Promise<string> {
    if (!isAbsolute(directory)) throw new Error("存档目录必须是绝对路径");
    await mkdir(this.dataDir, { recursive: true });
    await mkdir(directory, { recursive: true });
    const temporaryPath = `${this.preferencePath}.tmp`;
    await writeFile(temporaryPath, JSON.stringify({ directory }, null, 2), "utf8");
    await rename(temporaryPath, this.preferencePath);
    return directory;
  }

  async resetDirectory(): Promise<string> {
    await unlink(this.preferencePath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
    await mkdir(this.defaultDirectory, { recursive: true });
    return this.defaultDirectory;
  }

  async saveFile(suggestedName: string, content: Uint8Array): Promise<string> {
    const directory = await this.getDirectory();
    await mkdir(directory, { recursive: true });
    const safeName = basename(suggestedName).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim();
    const extension = extname(safeName);
    const stem = safeName.slice(0, Math.max(0, safeName.length - extension.length)) || "StudyPilot-export";
    for (let index = 0; index < 1000; index += 1) {
      const name = index === 0 ? `${stem}${extension}` : `${stem} (${index + 1})${extension}`;
      const target = join(directory, name);
      try {
        await writeFile(target, content, { flag: "wx" });
        return target;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    }
    throw new Error("存档目录中同名导出文件过多");
  }
}
