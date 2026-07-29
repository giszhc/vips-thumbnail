import fs from "node:fs";
import https from "node:https";
import http from "node:http";
import { AbortError, InstallError } from "./errors.js";

export interface DownloadCallbacks {
  onProgress?: (received: number, total: number) => void;
  signal?: AbortSignal;
}

export type Downloader = (
  url: string,
  destination: string,
  callbacks?: DownloadCallbacks
) => Promise<void>;

const MAX_REDIRECTS = 8;

/**
 * Node https 流式下载，手动跟随重定向（GitHub Release 会 302 到 CDN）。
 * 不调用任何外部命令。
 */
export const nodeDownload: Downloader = (url, destination, callbacks = {}) => {
  const { onProgress, signal } = callbacks;

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let currentRequest: http.ClientRequest | null = null;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      if (error) {
        fs.rm(destination, { force: true }, () => reject(error));
      } else {
        resolve();
      }
    };

    const onAbort = () => {
      currentRequest?.destroy();
      finish(new AbortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    if (signal?.aborted) {
      finish(new AbortError());
      return;
    }

    const request = (currentUrl: string, redirects: number) => {
      const client = currentUrl.startsWith("https:") ? https : http;
      currentRequest = client.get(
        currentUrl,
        { headers: { "User-Agent": "vips-thumbnail" } },
        response => {
          const status = response.statusCode ?? 0;

          if (status >= 300 && status < 400 && response.headers.location) {
            response.resume();
            if (redirects >= MAX_REDIRECTS) {
              finish(new InstallError("下载压缩引擎失败：重定向次数过多", "download"));
              return;
            }
            request(new URL(response.headers.location, currentUrl).toString(), redirects + 1);
            return;
          }

          if (status !== 200) {
            response.resume();
            finish(new InstallError(`下载压缩引擎失败：HTTP ${status}`, "download"));
            return;
          }

          const total = Number(response.headers["content-length"] ?? 0);
          let received = 0;

          const file = fs.createWriteStream(destination);
          response.on("data", (chunk: Buffer) => {
            received += chunk.length;
            onProgress?.(received, total);
          });
          response.on("error", error =>
            finish(new InstallError(`下载压缩引擎失败：${error.message}`, "download"))
          );
          file.on("error", error =>
            finish(new InstallError(`写入下载文件失败：${error.message}`, "download"))
          );
          file.on("finish", () => finish());
          response.pipe(file);
        }
      );

      currentRequest.on("error", error => {
        if (signal?.aborted) return;
        finish(new InstallError(`下载压缩引擎失败：${error.message}`, "download"));
      });
    };

    request(url, 0);
  });
};
