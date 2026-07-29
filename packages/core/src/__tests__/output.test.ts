import path from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigError } from "../errors.js";
import { planOutput, planOutputs, resolveTargetExt } from "../output.js";

const never = () => false;

describe("resolveTargetExt", () => {
  it("--ext 优先", () => {
    expect(resolveTargetExt("a.png", ".jpg")).toBe(".jpg");
  });

  it("null 时保持原扩展名（小写化）", () => {
    expect(resolveTargetExt("a.PNG", null)).toBe(".png");
    expect(resolveTargetExt("b.JpG", null)).toBe(".jpg");
  });
});

describe("planOutput - flat 模式（CLI 行为）", () => {
  it("输出到 outDir/<base><ext>", () => {
    const result = planOutput(
      { input: path.join("src", "子目录", "图 1.png"), outDir: "out", mode: "flat", ext: null },
      undefined,
      never
    );
    expect(result).toBe(path.join("out", "图 1.png"));
  });

  it("--ext 转换扩展名", () => {
    const result = planOutput(
      { input: "a.png", outDir: "out", mode: "flat", ext: ".jpg" },
      undefined,
      never
    );
    expect(result).toBe(path.join("out", "a.jpg"));
  });
});

describe("planOutput - preserve 模式（桌面端行为）", () => {
  it("保留相对 baseDir 的子目录结构", () => {
    const base = path.resolve("root");
    const input = path.join(base, "sub", "deep", "照片.jpg");
    const result = planOutput(
      { input, outDir: "out", mode: "preserve", ext: null, baseDir: base },
      undefined,
      never
    );
    expect(result).toBe(path.join("out", "sub", "deep", "照片.jpg"));
  });

  it("baseDir 之外的输入退化为顶层", () => {
    const result = planOutput(
      {
        input: path.resolve("elsewhere", "x.png"),
        outDir: "out",
        mode: "preserve",
        ext: null,
        baseDir: path.resolve("root")
      },
      undefined,
      never
    );
    expect(result).toBe(path.join("out", "x.png"));
  });
});

describe("planOutput - 去重", () => {
  it("同批重名追加 -1/-2", () => {
    const taken = new Set<string>();
    const first = planOutput(
      { input: path.join("a", "img.png"), outDir: "out", mode: "flat", ext: null, dedup: true },
      taken,
      never
    );
    const second = planOutput(
      { input: path.join("b", "img.png"), outDir: "out", mode: "flat", ext: null, dedup: true },
      taken,
      never
    );
    const third = planOutput(
      { input: path.join("c", "img.png"), outDir: "out", mode: "flat", ext: null, dedup: true },
      taken,
      never
    );
    expect(first).toBe(path.join("out", "img.png"));
    expect(second).toBe(path.join("out", "img-1.png"));
    expect(third).toBe(path.join("out", "img-2.png"));
  });

  it("磁盘已存在也追加序号", () => {
    const existsOnDisk = (p: string) => path.basename(p) === "img.png";
    const result = planOutput(
      { input: path.join("a", "img.png"), outDir: "out", mode: "flat", ext: null, dedup: true },
      new Set(),
      existsOnDisk
    );
    expect(result).toBe(path.join("out", "img-1.png"));
  });

  it("dedup=false 保持 CLI 覆盖行为", () => {
    const taken = new Set<string>();
    const a = planOutput(
      { input: path.join("a", "img.png"), outDir: "out", mode: "flat", ext: null },
      taken,
      never
    );
    const b = planOutput(
      { input: path.join("b", "img.png"), outDir: "out", mode: "flat", ext: null },
      taken,
      never
    );
    expect(a).toBe(b);
  });
});

describe("planOutput - 永不覆盖原图", () => {
  it("输出等于输入时抛错", () => {
    const input = path.resolve("out", "a.png");
    expect(() =>
      planOutput(
        { input, outDir: path.resolve("out"), mode: "flat", ext: null },
        undefined,
        never
      )
    ).toThrow(ConfigError);
  });

  it("dedup=true 时通过序号避开原图路径", () => {
    const input = path.resolve("out", "a.png");
    const result = planOutput(
      { input, outDir: path.resolve("out"), mode: "flat", ext: null, dedup: true },
      new Set(),
      p => path.resolve(p) === input
    );
    expect(result).toBe(path.resolve("out", "a-1.png"));
  });
});

describe("planOutputs", () => {
  it("批量规划保证全局唯一", () => {
    const requests = ["a", "b", "c"].map(dir => ({
      input: path.join(dir, "img.jpg"),
      outDir: "out",
      mode: "flat" as const,
      ext: null,
      dedup: true
    }));
    const result = planOutputs(requests, never);
    const outputs = [...result.values()];
    expect(new Set(outputs).size).toBe(3);
  });
});
