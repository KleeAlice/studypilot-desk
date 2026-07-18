// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BackendManager, findFreePort } from "../../electron/backend-manager";

const managers: BackendManager[] = [];
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(managers.splice(0).map((manager) => manager.stop()));
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("BackendManager", () => {
  it("allocates distinct ports and stops both child processes", async () => {
    const firstDirectory = await mkdtemp(join(tmpdir(), "studypilot-a-"));
    const secondDirectory = await mkdtemp(join(tmpdir(), "studypilot-b-"));
    directories.push(firstDirectory, secondDirectory);
    const first = new BackendManager({ dataDir: firstDirectory });
    const second = new BackendManager({ dataDir: secondDirectory });
    managers.push(first, second);

    const [firstRuntime, secondRuntime] = await Promise.all([first.start(), second.start()]);

    expect(firstRuntime.port).not.toBe(secondRuntime.port);
    expect((await fetch(`${firstRuntime.apiBase}/api/health`)).status).toBe(200);
    expect((await fetch(`${secondRuntime.apiBase}/api/health`)).status).toBe(200);
    await first.stop();
    await second.stop();
    expect(first.isRunning()).toBe(false);
    expect(second.isRunning()).toBe(false);
  }, 30_000);

  it("finds a usable loopback port", async () => {
    const port = await findFreePort();
    expect(port).toBeGreaterThan(1024);
  });
});

