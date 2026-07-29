import fs from "node:fs";
import type { SupportedExt } from "./types.js";

export interface ImageInfo {
  width: number;
  height: number;
  format: SupportedExt;
}

/**
 * 轻量解析 JPG/PNG 文件头获取宽高（不依赖 vips，扫描阶段使用）。
 * 解析失败返回 null（可能是损坏文件）。
 */
export function readImageInfo(buffer: Buffer): ImageInfo | null {
  if (buffer.length < 24) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A + IHDR
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    if (buffer.toString("ascii", 12, 16) !== "IHDR") return null;
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
      format: ".png"
    };
  }

  // JPEG: FF D8，扫描 SOF0-SOF15（除 DHT/DAC/RST 类）
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      // 独立标记（无长度段）
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
        offset += 2;
        continue;
      }
      const segmentLength = buffer.readUInt16BE(offset + 2);
      if (segmentLength < 2) return null;
      const isSof =
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc;
      if (isSof) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
          format: ".jpg"
        };
      }
      offset += 2 + segmentLength;
    }
    return null;
  }

  return null;
}

/** 从文件读取头部并解析宽高；读取失败或非图片返回 null */
export async function readImageInfoFromFile(
  filePath: string
): Promise<ImageInfo | null> {
  let handle: fs.promises.FileHandle | null = null;
  try {
    handle = await fs.promises.open(filePath, "r");
    // JPEG 的 SOF 标记可能在较后位置（EXIF 较大时），读 256KB 足够覆盖绝大多数
    const buffer = Buffer.alloc(256 * 1024);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return readImageInfo(buffer.subarray(0, bytesRead));
  } catch {
    return null;
  } finally {
    await handle?.close();
  }
}
