import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { AbortError, VipsError } from "./errors.js";

export interface SpawnResult {
  status: number;
  stdout: string;
  stderr: string;
}

export interface SpawnOptions {
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
}

/** 为 vips.exe 准备环境变量：把其 bin 目录前置到 PATH，保证同目录 DLL 可解析 */
export function buildVipsEnv(vipsCommand: string): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (path.isAbsolute(vipsCommand)) {
    const binDir = path.dirname(vipsCommand);
    env.PATH = `${binDir}${path.delimiter}${env.PATH ?? ""}`;
  }
  return env;
}

/**
 * 异步 spawn：参数数组调用，绝不拼接 Shell 字符串。
 * signal 中止时杀掉子进程并抛 AbortError。
 */
export function spawnAsync(
  command: string,
  args: string[],
  options: SpawnOptions = {}
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new AbortError());
      return;
    }

    const child = spawn(command, args, {
      env: options.env,
      cwd: options.cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let aborted = false;

    const onAbort = () => {
      aborted = true;
      child.kill();
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout?.on("data", chunk => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", chunk => {
      stderr += String(chunk);
    });

    child.on("error", error => {
      options.signal?.removeEventListener("abort", onAbort);
      reject(new VipsError(`无法执行压缩引擎：${error.message}`));
    });

    child.on("close", code => {
      options.signal?.removeEventListener("abort", onAbort);
      if (aborted) {
        reject(new AbortError());
        return;
      }
      resolve({ status: code ?? -1, stdout, stderr });
    });
  });
}

/** 同步 spawn（CLI 使用），行为与现有 CLI 一致 */
export function spawnSyncChecked(
  command: string,
  args: string[],
  env?: NodeJS.ProcessEnv
): void {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    windowsHide: true,
    env
  });
  if (result.error) {
    throw new VipsError(`无法执行压缩引擎：${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new VipsError(`压缩引擎执行失败，退出码：${result.status ?? "未知"}`);
  }
}

/** 检查命令能否执行 --version（同步，检测用） */
export function canRunVipsSync(command: string): boolean {
  const result = spawnSync(command, ["--version"], {
    stdio: "ignore",
    windowsHide: true,
    env: buildVipsEnv(command)
  });
  return !result.error && result.status === 0;
}
