import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { VIPS_VERSION, WINDOWS_VIPS_DIRECTORY } from "./constants.js";
import { VipsError } from "./errors.js";
import { canRunVipsSync } from "./spawn.js";

export interface VipsPaths {
  cacheRoot: string;
  installRoot: string;
  executable: string;
}

export interface VipsDetectorOptions {
  /** 缓存根目录（默认 %LOCALAPPDATA%\vips-thumbnail\libvips），测试可注入临时目录 */
  cacheRoot?: string;
  version?: string;
}

export const MISSING_VIPS_MESSAGE =
  "未检测到压缩引擎。macOS 请执行 `brew install vips`；" +
  "Ubuntu / Debian 请执行 `sudo apt install libvips-tools`。";

export class VipsDetector {
  readonly cacheRoot: string;
  readonly version: string;

  constructor(options: VipsDetectorOptions = {}) {
    this.cacheRoot = options.cacheRoot ?? VipsDetector.defaultCacheRoot();
    this.version = options.version ?? VIPS_VERSION;
  }

  static defaultCacheRoot(): string {
    const localAppData =
      process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    return path.join(localAppData, "vips-thumbnail", "libvips");
  }

  getWindowsPaths(): VipsPaths {
    const installRoot = path.join(this.cacheRoot, this.version);
    const executable = path.join(
      installRoot,
      WINDOWS_VIPS_DIRECTORY,
      "bin",
      "vips.exe"
    );
    return { cacheRoot: this.cacheRoot, installRoot, executable };
  }

  /** 检测系统 PATH 中的 vips，可用返回 "vips"，否则 null */
  detectSystem(): string | null {
    return canRunVipsSync("vips") ? "vips" : null;
  }

  /** Windows 缓存目录中的 vips.exe 是否存在且可运行 */
  isWindowsExecutableReady(): boolean {
    const { executable } = this.getWindowsPaths();
    return fs.existsSync(executable) && canRunVipsSync(executable);
  }

  /**
   * 解析可用的 vips 命令（不触发安装）：
   * 1) 系统 PATH；2) Windows 缓存。都不可用返回 null。
   */
  detect(): string | null {
    const system = this.detectSystem();
    if (system) return system;
    if (process.platform === "win32") {
      const { executable } = this.getWindowsPaths();
      if (fs.existsSync(executable) && canRunVipsSync(executable)) {
        return executable;
      }
    }
    return null;
  }

  /**
   * 解析 vips 命令；检测不到时：
   * - 非 Windows 抛 VipsError（含 brew/apt 指引，与 CLI 文案一致）
   * - Windows 返回 null（由调用方触发安装流程）
   */
  resolveOrNull(): string | null {
    const found = this.detect();
    if (found) return found;
    if (process.platform !== "win32") {
      throw new VipsError(MISSING_VIPS_MESSAGE);
    }
    return null;
  }
}
