import { describe, expect, it } from "vitest";
import { readImageInfo } from "../image-info.js";

function makePng(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(33);
  buffer.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  buffer.writeUInt32BE(13, 8); // IHDR length
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function makeJpeg(width: number, height: number): Buffer {
  // SOI + APP0(最小) + SOF0
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, ...new Array(14).fill(0)]);
  const sof = Buffer.alloc(2 + 2 + 5 + 4);
  sof[0] = 0xff;
  sof[1] = 0xc0;
  sof.writeUInt16BE(sof.length - 2, 2);
  sof[4] = 8; // precision
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.alloc(8)]);
}

describe("readImageInfo", () => {
  it("解析 PNG IHDR 宽高", () => {
    const info = readImageInfo(makePng(800, 600));
    expect(info).toEqual({ width: 800, height: 600, format: ".png" });
  });

  it("解析 JPEG SOF0 宽高", () => {
    const info = readImageInfo(makeJpeg(1920, 1080));
    expect(info).toEqual({ width: 1920, height: 1080, format: ".jpg" });
  });

  it("非图片返回 null", () => {
    expect(readImageInfo(Buffer.from("not an image, just text..."))).toBeNull();
    expect(readImageInfo(Buffer.alloc(4))).toBeNull();
  });

  it("PNG 魔数正确但缺少 IHDR 返回 null", () => {
    const buffer = makePng(1, 1);
    buffer.write("XXXX", 12, "ascii");
    expect(readImageInfo(buffer)).toBeNull();
  });
});
