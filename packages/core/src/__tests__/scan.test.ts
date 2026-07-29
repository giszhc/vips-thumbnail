import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isSupportedImage, scanPathsAsync, walkSync } from "../scan.js";

let root: string;

beforeAll(async () => {
  root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "vt-scan-"));
  const sub = path.join(root, "子 目录");
  await fs.promises.mkdir(sub, { recursive: true });
  // 有效 PNG 头（宽 2 高 3）
  const png = Buffer.alloc(33);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  png.write("IHDR", 12, "ascii");
  png.writeUInt32BE(2, 16);
  png.writeUInt32BE(3, 20);
  await fs.promises.writeFile(path.join(root, "图 1.png"), png);
  await fs.promises.writeFile(path.join(root, "b.JPG"), Buffer.from([0xff, 0xd8]));
  await fs.promises.writeFile(path.join(root, "note.txt"), "text");
  await fs.promises.writeFile(path.join(sub, "nested.jpeg"), Buffer.from([0xff, 0xd8]));
});

afterAll(async () => {
  await fs.promises.rm(root, { recursive: true, force: true });
});

describe("isSupportedImage", () => {
  it("大小写不敏感识别 jpg/jpeg/png", () => {
    expect(isSupportedImage("a.JPG")).toBe(true);
    expect(isSupportedImage("a.jpeg")).toBe(true);
    expect(isSupportedImage("a.PNG")).toBe(true);
    expect(isSupportedImage("a.webp")).toBe(false);
    expect(isSupportedImage("a.txt")).toBe(false);
  });
});

describe("scanPathsAsync", () => {
  it("目录非递归：只扫顶层图片", async () => {
    const entries = await scanPathsAsync([root], { recursive: false });
    const names = entries.map(e => e.fileName).sort();
    expect(names).toEqual(["b.JPG", "图 1.png"]);
  });

  it("目录递归：包含子目录，rootDir 为拖入目录", async () => {
    const entries = await scanPathsAsync([root], { recursive: true });
    expect(entries).toHaveLength(3);
    expect(entries.every(e => e.rootDir === root)).toBe(true);
    expect(entries.some(e => e.fileName === "nested.jpeg")).toBe(true);
  });

  it("解析 PNG 宽高", async () => {
    const entries = await scanPathsAsync([path.join(root, "图 1.png")], {
      recursive: false
    });
    expect(entries[0].width).toBe(2);
    expect(entries[0].height).toBe(3);
  });

  it("文件 + 所在目录同时传入时去重", async () => {
    const entries = await scanPathsAsync(
      [path.join(root, "图 1.png"), root],
      { recursive: false }
    );
    const count = entries.filter(e => e.fileName === "图 1.png").length;
    expect(count).toBe(1);
  });

  it("不存在的路径与非图片文件被跳过", async () => {
    const entries = await scanPathsAsync(
      [path.join(root, "不存在.png"), path.join(root, "note.txt")],
      { recursive: false }
    );
    expect(entries).toHaveLength(0);
  });

  it("AbortSignal 提前终止", async () => {
    const controller = new AbortController();
    controller.abort();
    const entries = await scanPathsAsync([root], { recursive: true }, {
      signal: controller.signal
    });
    expect(entries).toHaveLength(0);
  });
});

describe("walkSync（CLI 行为）", () => {
  it("非递归只返回顶层全部文件", () => {
    const files = walkSync(root, false).map(f => path.basename(f)).sort();
    expect(files).toEqual(["b.JPG", "note.txt", "图 1.png"]);
  });

  it("递归返回全部文件（含子目录）", () => {
    const files = walkSync(root, true).map(f => path.basename(f)).sort();
    expect(files).toEqual(["b.JPG", "nested.jpeg", "note.txt", "图 1.png"]);
  });
});
