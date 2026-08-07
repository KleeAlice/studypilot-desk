import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { ExportArchive } from "../../electron/export-archive";


const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

test("archive defaults under local data and never overwrites an earlier export", async () => {
  const root = await mkdtemp(join(tmpdir(), "studypilot-archive-"));
  temporaryRoots.push(root);
  const archive = new ExportArchive(root);

  expect(await archive.getDirectory()).toBe(join(root, "exports"));
  const first = await archive.saveFile("知识图谱.md", new TextEncoder().encode("first"));
  const second = await archive.saveFile("知识图谱.md", new TextEncoder().encode("second"));

  expect(first).toBe(join(root, "exports", "知识图谱.md"));
  expect(second).toBe(join(root, "exports", "知识图谱 (2).md"));
  expect(await readFile(first, "utf8")).toBe("first");
  expect(await readFile(second, "utf8")).toBe("second");
});

test("archive remembers a chosen directory and can return to its default", async () => {
  const root = await mkdtemp(join(tmpdir(), "studypilot-archive-"));
  const chosen = await mkdtemp(join(tmpdir(), "studypilot-chosen-"));
  temporaryRoots.push(root, chosen);
  await new ExportArchive(root).setDirectory(chosen);

  expect(await new ExportArchive(root).getDirectory()).toBe(chosen);
  expect(await new ExportArchive(root).resetDirectory()).toBe(join(root, "exports"));
  expect(await new ExportArchive(root).getDirectory()).toBe(join(root, "exports"));
});
