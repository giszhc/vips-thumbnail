import { ConfigError } from "./errors.js";
import { MAX_CONCURRENCY, MIN_CONCURRENCY } from "./constants.js";
import type { OutputExt } from "./types.js";

/** 与 CLI 报错文案保持一致 */
export function validateQuality(value: unknown): number {
  const quality = Number(value);
  if (!Number.isInteger(quality) || quality < 1 || quality > 100) {
    throw new ConfigError("--quality 必须是 1 到 100 之间的整数");
  }
  return quality;
}

/** null 表示保持原尺寸 */
export function validateSize(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const size = Number(value);
  if (!Number.isInteger(size) || size < 1) {
    throw new ConfigError("--size 必须是正整数");
  }
  return size;
}

/** null 表示保持原格式 */
export function validateExt(value: unknown): OutputExt | null {
  if (value === null || value === undefined || value === "") return null;
  if (
    typeof value !== "string" ||
    ![".jpg", ".jpeg", ".png"].includes(value.toLowerCase())
  ) {
    throw new ConfigError("--ext 仅支持 .jpg、.jpeg 或 .png");
  }
  return value.toLowerCase() as OutputExt;
}

export function validateConcurrency(value: unknown): number {
  const concurrency = Number(value);
  if (
    !Number.isInteger(concurrency) ||
    concurrency < MIN_CONCURRENCY ||
    concurrency > MAX_CONCURRENCY
  ) {
    throw new ConfigError(
      `并发数必须是 ${MIN_CONCURRENCY} 到 ${MAX_CONCURRENCY} 之间的整数`
    );
  }
  return concurrency;
}
