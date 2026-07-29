import type { SupportedExt } from "./types.js";

export const VIPS_VERSION = "8.18.4";

/** 官方 zip 顶层目录名，与现有 CLI 保持一致 */
export const WINDOWS_VIPS_DIRECTORY = "vips-dev-8.18";

/** Windows 压缩引擎下载地址（使用 gh-proxy 加速，避免 GitHub 直连被重置） */
export const WINDOWS_VIPS_URL =
  "https://gh-proxy.com/https://github.com/libvips/build-win64-mxe/releases/download/v8.18.4/vips-dev-x64-all-8.18.4.zip";

export const WINDOWS_VIPS_SHA256 =
  "95a56455ac525c9cb64865804322bbacad07021ded8ec49327fa3e392b91935b";

export const DEFAULT_QUALITY = 85;

export const MIN_CONCURRENCY = 1;
export const MAX_CONCURRENCY = 4;
export const DEFAULT_CONCURRENCY = 2;

export const SUPPORTED_EXTS: SupportedExt[] = [".jpg", ".jpeg", ".png"];

/** 默认输出子目录名（桌面端：原目录/compressed） */
export const DEFAULT_OUTPUT_DIR_NAME = "compressed";
