import fs from "node:fs";
import path from "node:path";
import { ConfigError } from "./errors.js";
import type { OutputExt, OutputMode } from "./types.js";

export interface OutputPlanRequest {
  input: string;
  outDir: string;
  mode: OutputMode;
  /** null = 保持原扩展名 */
  ext: OutputExt | null;
  /** preserve 模式下的相对根目录（通常为拖入的源目录） */
  baseDir?: string;
  /** true 时目标已存在则追加 -1/-2 序号（桌面端）；false 保持 CLI 覆盖行为 */
  dedup?: boolean;
}

/** 归一化输出扩展名：--ext 传什么用什么（与 CLI 一致），桌面端 JPG 统一传 .jpg */
export function resolveTargetExt(input: string, ext: OutputExt | null): string {
  return ext ?? path.extname(input).toLowerCase();
}

function relativeSubDir(input: string, baseDir: string): string {
  const relative = path.relative(baseDir, path.dirname(input));
  if (!relative || relative === ".") return "";
  if (relative.startsWith("..")) return ""; // 不在 baseDir 内则退化为顶层
  return relative;
}

function dedupPath(
  candidate: string,
  taken: Set<string>,
  existsOnDisk: (p: string) => boolean
): string {
  const dir = path.dirname(candidate);
  const ext = path.extname(candidate);
  const base = path.basename(candidate, ext);
  let result = candidate;
  let index = 0;
  while (taken.has(result.toLowerCase()) || existsOnDisk(result)) {
    index += 1;
    result = path.join(dir, `${base}-${index}${ext}`);
  }
  return result;
}

/**
 * 规划单个输出路径。
 * - flat：outDir/<base><ext>（CLI 行为）。
 * - preserve：outDir/<相对 baseDir 的子路径>/<base><ext>。
 * - dedup=true：目标存在时自动 -1/-2 序号。
 * - 永不允许输出等于输入（不覆盖原图）。
 */
export function planOutput(
  request: OutputPlanRequest,
  taken?: Set<string>,
  existsOnDisk: (p: string) => boolean = p => fs.existsSync(p)
): string {
  const { input, outDir, mode, ext, baseDir, dedup = false } = request;
  const targetExt = resolveTargetExt(input, ext);
  const base = path.basename(input, path.extname(input));

  let candidate: string;
  if (mode === "preserve" && baseDir) {
    candidate = path.join(outDir, relativeSubDir(input, baseDir), base + targetExt);
  } else {
    candidate = path.join(outDir, base + targetExt);
  }

  if (dedup) {
    candidate = dedupPath(candidate, taken ?? new Set(), existsOnDisk);
  }

  if (path.resolve(candidate) === path.resolve(input)) {
    throw new ConfigError("输出路径与原图相同，已阻止覆盖原图");
  }

  taken?.add(candidate.toLowerCase());
  return candidate;
}

/** 批量规划输出路径，保证同一批内全局唯一（dedup=true 时） */
export function planOutputs(
  requests: OutputPlanRequest[],
  existsOnDisk?: (p: string) => boolean
): Map<string, string> {
  const taken = new Set<string>();
  const result = new Map<string, string>();
  for (const request of requests) {
    result.set(request.input, planOutput(request, taken, existsOnDisk));
  }
  return result;
}
