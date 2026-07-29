import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extractZip } from "../unzip.js";

let root: string;
let zipPath: string;
let zipAvailable = false;

/** 用 PowerShell Compress-Archive 造一个真实 zip（仅测试环境使用） */
function makeZip(sourceDir: string, dest: string): boolean {
  try {
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `Compress-Archive -Path '${sourceDir}\\*' -DestinationPath '${dest}' -Force`
      ],
      { stdio: "ignore", timeout: 60_000 }
    );
    return fs.existsSync(dest);
  } catch {
    return false;
  }
}

beforeAll(async () => {
  root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "vt-unzip-"));
  const source = path.join(root, "source");
  await fs.promises.mkdir(path.join(source, "子 目录"), { recursive: true });
  await fs.promises.writeFile(path.join(source, "文件 一.txt"), "内容A");
  await fs.promises.writeFile(path.join(source, "子 目录", "nested.bin"), Buffer.from([1, 2, 3]));
  zipPath = path.join(root, "测试 包.zip");
  zipAvailable = makeZip(source, zipPath);
});

afterAll(async () => {
  await fs.promises.rm(root, { recursive: true, force: true });
});

describe("extractZip", () => {
  it("解压保留目录结构与内容（含中文/空格路径）", async ctx => {
    if (!zipAvailable) return ctx.skip();
    const dest = path.join(root, "输出 目录");
    let lastDone = 0;
    let lastTotal = 0;
    await extractZip(zipPath, dest, {
      onEntry: (done, total) => {
        lastDone = done;
        lastTotal = total;
      }
    });
    expect(await fs.promises.readFile(path.join(dest, "文件 一.txt"), "utf8")).toBe("内容A");
    expect(
      await fs.promises.readFile(path.join(dest, "子 目录", "nested.bin"))
    ).toEqual(Buffer.from([1, 2, 3]));
    expect(lastDone).toBe(lastTotal);
    expect(lastTotal).toBeGreaterThan(0);
  });

  it("已取消的信号立即中止", async ctx => {
    if (!zipAvailable) return ctx.skip();
    const controller = new AbortController();
    controller.abort();
    await expect(
      extractZip(zipPath, path.join(root, "abort-dest"), { signal: controller.signal })
    ).rejects.toThrow("任务已取消");
  });

  it("损坏的 zip 报安装错误", async () => {
    const bad = path.join(root, "bad.zip");
    await fs.promises.writeFile(bad, "这不是 zip");
    await expect(extractZip(bad, path.join(root, "bad-dest"))).rejects.toThrow(
      "无法读取压缩引擎安装包"
    );
  });
});
