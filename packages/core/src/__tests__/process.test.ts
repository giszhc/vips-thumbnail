import { describe, expect, it } from "vitest";
import { VipsError } from "../errors.js";
import { buildVipsSteps } from "../process.js";

describe("buildVipsSteps", () => {
  it("PNG 不缩放返回 null（直接复制）", () => {
    expect(
      buildVipsSteps("a.png", "out.png", "out.png.v", {
        quality: 85,
        size: null,
        ext: null
      })
    ).toBeNull();
  });

  it("JPG 不缩放：resize 1 + jpegsave", () => {
    const steps = buildVipsSteps("a.jpg", "out.jpg", "tmp", {
      quality: 80,
      size: null,
      ext: null
    });
    expect(steps).toEqual([
      { args: ["resize", "a.jpg", "tmp", "1"] },
      { args: ["jpegsave", "tmp", "out.jpg", "--Q=80", "--strip"] }
    ]);
  });

  it("JPG 缩放：thumbnail + jpegsave", () => {
    const steps = buildVipsSteps("a.jpg", "out.jpg", "tmp", {
      quality: 75,
      size: 400,
      ext: null
    });
    expect(steps).toEqual([
      { args: ["thumbnail", "a.jpg", "tmp", "400"] },
      { args: ["jpegsave", "tmp", "out.jpg", "--Q=75", "--strip"] }
    ]);
  });

  it("PNG 缩放：thumbnail + pngsave", () => {
    const steps = buildVipsSteps("a.png", "out.png", "tmp", {
      quality: 85,
      size: 300,
      ext: null
    });
    expect(steps).toEqual([
      { args: ["thumbnail", "a.png", "tmp", "300"] },
      { args: ["pngsave", "tmp", "out.png", "--compression=9"] }
    ]);
  });

  it(".jpeg 输出走 jpegsave", () => {
    const steps = buildVipsSteps("a.png", "out.jpeg", "tmp", {
      quality: 85,
      size: null,
      ext: ".jpeg"
    });
    expect(steps?.[1].args[0]).toBe("jpegsave");
  });

  it("不支持的输出格式抛 VipsError", () => {
    expect(() =>
      buildVipsSteps("a.jpg", "out.webp", "tmp", {
        quality: 85,
        size: 100,
        ext: null
      })
    ).toThrow(VipsError);
  });

  it("参数全部为独立数组元素（无 shell 拼接）", () => {
    const steps = buildVipsSteps("含 空格/图 1.jpg", "输出 目录/图 1.jpg", "tmp p", {
      quality: 90,
      size: 200,
      ext: null
    });
    for (const step of steps ?? []) {
      for (const arg of step.args) {
        expect(typeof arg).toBe("string");
      }
    }
    expect(steps?.[0].args).toContain("含 空格/图 1.jpg");
  });
});
