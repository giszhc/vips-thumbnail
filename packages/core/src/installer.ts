import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  VIPS_VERSION,
  WINDOWS_VIPS_DIRECTORY,
  WINDOWS_VIPS_SHA256,
  WINDOWS_VIPS_URL
} from "./constants.js";
import { AbortError, InstallError } from "./errors.js";
import { buildVipsEnv, spawnAsync } from "./spawn.js";
import { nodeDownload, type Downloader } from "./download.js";
import { extractZip } from "./unzip.js";
import { VipsDetector } from "./vips.js";
import type { InstallProgress } from "./types.js";

export type Unzipper = (
  src: string,
  dest: string,
  callbacks?: { signal?: AbortSignal; onEntry?: (done: number, total: number) => void }
) => Promise<void>;

export interface InstallWindowsVipsOptions {
  url?: string;
  sha256?: string;
  version?: string;
  cacheRoot?: string;
  onProgress?: (progress: InstallProgress) => void;
  signal?: AbortSignal;
  downloader?: Downloader;
  unzipper?: Unzipper;
  /** 测试注入：跳过架构检查 */
  skipArchCheck?: boolean;
}

/** 流式计算文件 SHA-256（不整块读入内存） */
export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", chunk => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

export async function verifySha256(
  filePath: string,
  expected: string
): Promise<boolean> {
  const actual = await sha256File(filePath);
  return actual === expected.toLowerCase();
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new AbortError();
}

/**
 * Windows x64 自动安装 libvips：
 * 下载 → SHA-256 校验 → 解压到暂存目录 → 验证 vips.exe --version → 原子移动到正式目录。
 * 校验失败绝不执行下载文件；失败时清理临时文件；已安装时不重复下载。
 * 返回 vips.exe 的绝对路径。
 */
export async function installWindowsVips(
  options: InstallWindowsVipsOptions = {}
): Promise<string> {
  const {
    url = WINDOWS_VIPS_URL,
    sha256 = WINDOWS_VIPS_SHA256,
    version = VIPS_VERSION,
    onProgress,
    signal,
    downloader = nodeDownload,
    unzipper = extractZip,
    skipArchCheck = false
  } = options;

  if (!skipArchCheck && process.arch !== "x64") {
    throw new InstallError(
      `Windows 自动安装目前仅支持 x64，当前架构为 ${process.arch}`,
      "precheck"
    );
  }

  const detector = new VipsDetector({ cacheRoot: options.cacheRoot, version });
  const { cacheRoot, installRoot, executable } = detector.getWindowsPaths();

  // 已安装且可运行 → 直接复用
  if (detector.isWindowsExecutableReady()) {
    return executable;
  }

  fs.mkdirSync(cacheRoot, { recursive: true });

  // 缓存损坏（目录存在但不可运行）→ 自动修复：删除后重装
  if (fs.existsSync(installRoot)) {
    fs.rmSync(installRoot, { recursive: true, force: true });
  }

  const suffix = `${process.pid}-${Date.now()}`;
  const archive = path.join(cacheRoot, `.vips-${suffix}.zip`);
  const staging = path.join(cacheRoot, `.vips-${suffix}`);

  try {
    throwIfAborted(signal);

    // 1. 下载
    await downloader(url, archive, {
      signal,
      onProgress: (received, total) => {
        onProgress?.({
          phase: "download",
          received,
          total,
          percent: total > 0 ? Math.round((received / total) * 100) : 0
        });
      }
    });
    throwIfAborted(signal);

    // 2. SHA-256 校验（失败绝不执行下载文件）
    onProgress?.({ phase: "verify", received: 0, total: 0, percent: 0 });
    const actualHash = await sha256File(archive);
    if (actualHash !== sha256.toLowerCase()) {
      throw new InstallError(
        `压缩引擎文件校验失败，实际 SHA-256：${actualHash}`,
        "verify"
      );
    }
    throwIfAborted(signal);

    // 3. 解压到暂存目录
    onProgress?.({ phase: "extract", received: 0, total: 0, percent: 0 });
    fs.mkdirSync(staging, { recursive: true });
    await unzipper(archive, staging, {
      signal,
      onEntry: (done, total) => {
        onProgress?.({
          phase: "extract",
          received: done,
          total,
          percent: total > 0 ? Math.round((done / total) * 100) : 0
        });
      }
    });
    throwIfAborted(signal);

    // 4. 兜底校验目录结构
    const stagedExecutable = path.join(
      staging,
      WINDOWS_VIPS_DIRECTORY,
      "bin",
      "vips.exe"
    );
    if (!fs.existsSync(stagedExecutable)) {
      throw new InstallError("压缩引擎安装包中未找到可执行文件", "extract");
    }

    // 5. 验证可运行
    onProgress?.({ phase: "finalize", received: 0, total: 0, percent: 0 });
    const result = await spawnAsync(stagedExecutable, ["--version"], {
      env: buildVipsEnv(stagedExecutable),
      signal
    });
    if (result.status !== 0) {
      throw new InstallError(
        `压缩引擎已解压但无法运行：${stagedExecutable}`,
        "finalize"
      );
    }

    // 6. 原子移动；多进程并发安装时复用已完成的安装
    if (!fs.existsSync(installRoot)) {
      try {
        fs.renameSync(staging, installRoot);
      } catch (error) {
        if (!fs.existsSync(executable)) throw error;
      }
    }
  } finally {
    fs.rmSync(archive, { force: true });
    fs.rmSync(staging, { recursive: true, force: true });
  }

  if (!detector.isWindowsExecutableReady()) {
    throw new InstallError(`压缩引擎已解压但无法运行：${executable}`, "finalize");
  }
  return executable;
}
