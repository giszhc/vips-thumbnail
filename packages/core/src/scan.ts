import fs from "node:fs";
import path from "node:path";
import { SUPPORTED_EXTS } from "./constants.js";
import { readImageInfoFromFile } from "./image-info.js";
import type { FileEntry, ScanOptions, SupportedExt } from "./types.js";

export function isSupportedImage(filePath: string): boolean {
  return SUPPORTED_EXTS.includes(
    path.extname(filePath).toLowerCase() as SupportedExt
  );
}

export interface ScanProgress {
  scanned: number;
  currentPath: string;
}

export interface ScanCallbacks {
  onProgress?: (progress: ScanProgress) => void;
  signal?: AbortSignal;
}

async function toFileEntry(
  absolutePath: string,
  rootDir: string,
  skipImageInfo: boolean,
  fromDir: boolean
): Promise<FileEntry | null> {
  try {
    const stat = await fs.promises.stat(absolutePath);
    if (!stat.isFile()) return null;
    // 大批量场景下逐个读取图片头很慢；skipImageInfo 时不解析宽高
    const info = skipImageInfo ? null : await readImageInfoFromFile(absolutePath);
    const ext = path.extname(absolutePath).toLowerCase() as SupportedExt;
    return {
      absolutePath,
      fileName: path.basename(absolutePath),
      baseName: path.basename(absolutePath, path.extname(absolutePath)),
      ext,
      size: stat.size,
      width: info?.width ?? 0,
      height: info?.height ?? 0,
      mtimeMs: stat.mtimeMs,
      rootDir,
      fromDir
    };
  } catch {
    return null;
  }
}

async function walkDirectory(
  directory: string,
  recursive: boolean,
  rootDir: string,
  entries: FileEntry[],
  callbacks: ScanCallbacks,
  counter: { scanned: number },
  skipImageInfo: boolean
): Promise<void> {
  if (callbacks.signal?.aborted) return;

  let dirents: fs.Dirent[];
  try {
    dirents = await fs.promises.readdir(directory, { withFileTypes: true });
  } catch {
    return; // 无法读取的目录直接跳过
  }

  for (const dirent of dirents) {
    if (callbacks.signal?.aborted) return;
    const fullPath = path.join(directory, dirent.name);
    if (dirent.isDirectory()) {
      if (recursive) {
        await walkDirectory(
          fullPath,
          recursive,
          rootDir,
          entries,
          callbacks,
          counter,
          skipImageInfo
        );
      }
    } else if (dirent.isFile() && isSupportedImage(fullPath)) {
      const entry = await toFileEntry(fullPath, rootDir, skipImageInfo, true);
      if (entry) {
        entries.push(entry);
        counter.scanned += 1;
        callbacks.onProgress?.({ scanned: counter.scanned, currentPath: fullPath });
      }
    }
  }
}

/**
 * 扫描输入路径（文件或目录）生成 FileEntry 列表。
 * - 文件：仅保留支持格式；rootDir 为其所在目录。
 * - 目录：按 recursive 决定是否递归；rootDir 为该目录（用于 preserve 模式相对路径）。
 * - 同一 absolutePath 去重。
 */
export async function scanPathsAsync(
  inputs: string[],
  options: ScanOptions,
  callbacks: ScanCallbacks = {}
): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];
  const counter = { scanned: 0 };

  for (const input of inputs) {
    if (callbacks.signal?.aborted) break;
    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(input);
    } catch {
      continue; // 不存在的路径跳过
    }

    if (stat.isFile()) {
      if (!isSupportedImage(input)) continue;
      const entry = await toFileEntry(
        input,
        path.dirname(input),
        options.skipImageInfo ?? false,
        false
      );
      if (entry) {
        entries.push(entry);
        counter.scanned += 1;
        callbacks.onProgress?.({ scanned: counter.scanned, currentPath: input });
      }
    } else if (stat.isDirectory()) {
      await walkDirectory(
        input,
        options.recursive,
        input,
        entries,
        callbacks,
        counter,
        options.skipImageInfo ?? false
      );
    }
  }

  // 去重（同一路径只保留一份）
  const seen = new Set<string>();
  return entries.filter(entry => {
    const key = path.resolve(entry.absolutePath);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** CLI 用的同步 walk（与现有 CLI 行为一致：返回全部文件，由调用方过滤） */
export function walkSync(directory: string, recursive: boolean): string[] {
  let list: string[] = [];
  for (const file of fs.readdirSync(directory)) {
    const filePath = path.join(directory, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory() && recursive) {
      list = list.concat(walkSync(filePath, recursive));
    } else if (stat.isFile()) {
      list.push(filePath);
    }
  }
  return list;
}
