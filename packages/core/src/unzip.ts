import fs from "node:fs";
import path from "node:path";
import yauzl from "yauzl";
import { AbortError, InstallError } from "./errors.js";

export interface UnzipCallbacks {
  signal?: AbortSignal;
  onEntry?: (entriesDone: number, entriesTotal: number) => void;
}

/**
 * 纯 JS 解压 zip（yauzl），不调用任何外部命令。
 * 防 Zip Slip：条目路径必须落在目标目录内。
 */
export function extractZip(
  src: string,
  dest: string,
  callbacks: UnzipCallbacks = {}
): Promise<void> {
  const { signal, onEntry } = callbacks;
  return new Promise((resolve, reject) => {
    yauzl.open(src, { lazyEntries: true }, (openError, zipfile) => {
      if (openError || !zipfile) {
        reject(new InstallError(`无法读取压缩引擎安装包：${openError?.message ?? "未知错误"}`, "extract"));
        return;
      }

      const total = zipfile.entryCount;
      let done = 0;
      let settled = false;

      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        zipfile.close();
        if (error) reject(error);
        else resolve();
      };

      const onAbort = () => finish(new AbortError());
      signal?.addEventListener("abort", onAbort, { once: true });

      zipfile.on("error", error =>
        finish(new InstallError(`解压压缩引擎失败：${error.message}`, "extract"))
      );

      zipfile.on("entry", entry => {
        if (signal?.aborted) {
          finish(new AbortError());
          return;
        }

        const entryPath = path.join(dest, entry.fileName);
        const normalized = path.resolve(entryPath);
        if (!normalized.startsWith(path.resolve(dest) + path.sep) && normalized !== path.resolve(dest)) {
          finish(new InstallError("压缩包包含非法路径，已终止解压", "extract"));
          return;
        }

        if (/\/$/.test(entry.fileName)) {
          fs.mkdir(entryPath, { recursive: true }, mkdirError => {
            if (mkdirError) {
              finish(new InstallError(`解压压缩引擎失败：${mkdirError.message}`, "extract"));
              return;
            }
            done += 1;
            onEntry?.(done, total);
            zipfile.readEntry();
          });
          return;
        }

        zipfile.openReadStream(entry, (streamError, readStream) => {
          if (streamError || !readStream) {
            finish(new InstallError(`解压压缩引擎失败：${streamError?.message ?? "未知错误"}`, "extract"));
            return;
          }
          fs.mkdir(path.dirname(entryPath), { recursive: true }, mkdirError => {
            if (mkdirError) {
              finish(new InstallError(`解压压缩引擎失败：${mkdirError.message}`, "extract"));
              return;
            }
            const writeStream = fs.createWriteStream(entryPath);
            readStream.on("error", error =>
              finish(new InstallError(`解压压缩引擎失败：${error.message}`, "extract"))
            );
            writeStream.on("error", error =>
              finish(new InstallError(`解压压缩引擎失败：${error.message}`, "extract"))
            );
            writeStream.on("close", () => {
              done += 1;
              onEntry?.(done, total);
              zipfile.readEntry();
            });
            readStream.pipe(writeStream);
          });
        });
      });

      zipfile.on("end", () => finish());
      zipfile.readEntry();
    });
  });
}
