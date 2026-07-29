import { describe, expect, it } from "vitest";
import { ConfigError } from "../errors.js";
import {
  validateConcurrency,
  validateExt,
  validateQuality,
  validateSize
} from "../options.js";

describe("validateQuality", () => {
  it("接受 1-100 整数", () => {
    expect(validateQuality(1)).toBe(1);
    expect(validateQuality("85")).toBe(85);
    expect(validateQuality(100)).toBe(100);
  });

  it("拒绝越界与非整数", () => {
    for (const bad of [0, 101, 1.5, "abc", NaN, null, undefined]) {
      expect(() => validateQuality(bad)).toThrow(ConfigError);
    }
  });

  it("报错文案与 CLI 一致", () => {
    expect(() => validateQuality(0)).toThrow("--quality 必须是 1 到 100 之间的整数");
  });
});

describe("validateSize", () => {
  it("null/undefined 表示保持原尺寸", () => {
    expect(validateSize(null)).toBeNull();
    expect(validateSize(undefined)).toBeNull();
  });

  it("接受正整数", () => {
    expect(validateSize(400)).toBe(400);
    expect(validateSize("1024")).toBe(1024);
  });

  it("拒绝 0、负数与小数", () => {
    for (const bad of [0, -1, 2.5, "abc"]) {
      expect(() => validateSize(bad)).toThrow("--size 必须是正整数");
    }
  });
});

describe("validateExt", () => {
  it("null/空表示保持原格式", () => {
    expect(validateExt(null)).toBeNull();
    expect(validateExt(undefined)).toBeNull();
    expect(validateExt("")).toBeNull();
  });

  it("接受 .jpg/.jpeg/.png（大小写不敏感）", () => {
    expect(validateExt(".jpg")).toBe(".jpg");
    expect(validateExt(".JPEG")).toBe(".jpeg");
    expect(validateExt(".PNG")).toBe(".png");
  });

  it("拒绝其他格式", () => {
    for (const bad of [".webp", "jpg", ".gif", 42]) {
      expect(() => validateExt(bad)).toThrow("--ext 仅支持 .jpg、.jpeg 或 .png");
    }
  });
});

describe("validateConcurrency", () => {
  it("接受 1-4", () => {
    expect(validateConcurrency(1)).toBe(1);
    expect(validateConcurrency(4)).toBe(4);
  });

  it("拒绝越界", () => {
    for (const bad of [0, 5, 2.5, "x"]) {
      expect(() => validateConcurrency(bad)).toThrow(ConfigError);
    }
  });
});
