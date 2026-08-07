import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import net from "node:net";
import { dirname, join, resolve } from "node:path";


export interface BackendRuntime {
  port: number;
  apiBase: string;
  sessionToken: string;
}

export interface BackendManagerOptions {
  dataDir: string;
  projectRoot?: string;
  startupTimeoutMs?: number;
  backendExecutable?: string;
}

export async function findFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("无法分配本地端口"));
        return;
      }
      const port = address.port;
      server.close((error) => (error ? reject(error) : resolvePort(port)));
    });
  });
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null) return Promise.resolve(true);
  return new Promise((resolveExit) => {
    const timer = setTimeout(() => resolveExit(false), timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolveExit(true);
    });
  });
}

export class BackendManager {
  private readonly options: {
    dataDir: string;
    projectRoot: string;
    startupTimeoutMs: number;
    backendExecutable?: string;
  };
  private child?: ChildProcess;
  private runtime?: BackendRuntime;
  private logTail = "";

  constructor(options: BackendManagerOptions) {
    this.options = {
      projectRoot: resolve(options.projectRoot ?? process.cwd()),
      startupTimeoutMs: options.startupTimeoutMs ?? 15_000,
      dataDir: resolve(options.dataDir),
      backendExecutable: options.backendExecutable ? resolve(options.backendExecutable) : undefined,
    };
  }

  async start(): Promise<BackendRuntime> {
    if (this.isRunning() && this.runtime) return this.runtime;
    const port = await findFreePort();
    const sessionToken = randomBytes(24).toString("hex");
    const executable = this.options.backendExecutable ?? this.pythonExecutable();
    if (!existsSync(executable)) {
      throw new Error(`StudyPilot backend runtime was not found: ${executable}`);
    }
    const args = this.options.backendExecutable
      ? []
      : ["-m", "uvicorn", "backend.app.main:app", "--host", "127.0.0.1", "--port", String(port), "--log-level", "warning"];
    const cwd = this.options.backendExecutable
      ? dirname(this.options.backendExecutable)
      : this.options.projectRoot;
    this.logTail = "";
    const child = spawn(
      executable,
      args,
      {
        cwd,
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8",
          STUDYPILOT_BACKEND_PORT: String(port),
          STUDYPILOT_DATA_DIR: this.options.dataDir,
          STUDYPILOT_SESSION_TOKEN: sessionToken,
        },
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    this.child = child;
    child.stdout?.on("data", (chunk) => this.appendLog(String(chunk)));
    child.stderr?.on("data", (chunk) => this.appendLog(String(chunk)));
    const runtime = { port, apiBase: `http://127.0.0.1:${port}`, sessionToken };
    this.runtime = runtime;

    try {
      await this.waitUntilHealthy(runtime);
      return runtime;
    } catch (error) {
      await this.stop();
      const detail = this.logTail.trim() ? `\n${this.logTail.trim()}` : "";
      throw new Error(`StudyPilot 后端启动失败：${String(error)}${detail}`);
    }
  }

  isRunning(): boolean {
    return Boolean(this.child && this.child.exitCode === null && !this.child.killed);
  }

  async stop(): Promise<void> {
    const child = this.child;
    const runtime = this.runtime;
    if (!child) return;
    if (child.exitCode === null && runtime) {
      try {
        await fetch(`${runtime.apiBase}/api/system/shutdown`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token: runtime.sessionToken }),
          signal: AbortSignal.timeout(500),
        });
      } catch {
        // The process may already be exiting; lifecycle cleanup continues below.
      }
    }
    const exited = await waitForExit(child, 400);
    if (!exited && child.exitCode === null) {
      child.kill();
      await waitForExit(child, 2_000);
    }
    this.child = undefined;
    this.runtime = undefined;
  }

  private pythonExecutable(): string {
    const candidate = process.platform === "win32"
      ? join(this.options.projectRoot, ".venv", "Scripts", "python.exe")
      : join(this.options.projectRoot, ".venv", "bin", "python");
    if (!existsSync(candidate)) {
      throw new Error(`未找到项目 Python 环境：${candidate}`);
    }
    return candidate;
  }

  private async waitUntilHealthy(runtime: BackendRuntime): Promise<void> {
    const deadline = Date.now() + this.options.startupTimeoutMs;
    while (Date.now() < deadline) {
      if (!this.isRunning()) throw new Error("后端进程提前退出");
      try {
        const response = await fetch(`${runtime.apiBase}/api/health`, {
          signal: AbortSignal.timeout(500),
        });
        if (response.ok) return;
      } catch {
        // Expected while uvicorn and the database are initializing.
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 80));
    }
    throw new Error("等待健康检查超时");
  }

  private appendLog(chunk: string): void {
    this.logTail = (this.logTail + chunk).slice(-8_000);
  }
}
