import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ConfigError } from "./errors.js";
import { buildVipsEnv, spawnAsync, spawnSyncChecked } from "./spawn.js";
import { VipsError } from "./errors.js";
import type { ProcessOptions } from "./types.js";

export interface ProcessImageOptions extends ProcessOptions {
  vipsCommand: string;
  signal?: AbortSignal;
}

interface VipsStep {
  args: string[];
}

/** 生成处理步骤（纯函数，便于测试）；返回 null 表示直接复制（PNG 不缩放场景） */
export function buildVipsSteps(
  input: string,
  output: string,
  temporary: string,
  options: ProcessOptions
): VipsStep[] | null {
  const outExt = path.extname(output).toLowerCase();

  // PNG 不缩放时直接复制，避免重新编码后体积变大（与 CLI 行为一致）
  if (!options.size && outExt === ".png") {
    return null;
  }

  const steps: VipsStep[] = [];
  if (options.size) {
    steps.push({ args: ["thumbnail", input, temporary, String(options.size)] });
  } else {
    steps.push({ args: ["resize", input, temporary, "1"] });
  }

  if (outExt === ".jpg" || outExt === ".jpeg") {
    steps.push({
      args: ["jpegsave", temporary, output, `--Q=${options.quality}`, "--strip"]
    });
  } else if (outExt === ".png") {
    steps.push({ args: ["pngsave", temporary, output, "--compression=9"] });
  } else {
    throw new VipsError(`不支持的输出格式：${outExt}`);
  }
  return steps;
}

function makeTemporaryPath(output: string): string {
  // 中间文件必须有合法图片扩展名，否则 vips 无法推断目标格式而直接退出码 1
  // （VipsForeignSave: "...tmp" is not a known file format）。
  // 统一用 .png（无损且 vips 必然支持），最终保存步骤再按目标格式编码。
  return `${output}.v-${process.pid}-${crypto.randomBytes(4).toString("hex")}.png`;
}

function assertNotOverwritingInput(input: string, output: string): void {
  if (path.resolve(input) === path.resolve(output)) {
    throw new ConfigError("输出路径与原图相同，已阻止覆盖原图");
  }
}

/** 异步处理单张图片（桌面端使用），支持 AbortSignal 取消，临时文件必清理 */
export async function processImage(
  input: string,
  output: string,
  options: ProcessImageOptions
): Promise<void> {
  assertNotOverwritingInput(input, output);
  const temporary = makeTemporaryPath(output);
  const steps = buildVipsSteps(input, output, temporary, options);

  if (steps === null) {
    await fs.promises.copyFile(input, output);
    return;
  }

  const env = buildVipsEnv(options.vipsCommand);
  try {
    for (const step of steps) {
      const result = await spawnAsync(options.vipsCommand, step.args, {
        env,
        signal: options.signal
      });
      if (result.status !== 0) {
        throw new VipsError(
          `压缩引擎执行失败，退出码：${result.status}\n${result.stderr.trim()}`,
          result.stderr.trim()
        );
      }
    }
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

/** 同步处理单张图片（CLI 使用），行为与现有 CLI 完全一致 */
export function processImageSync(
  input: string,
  output: string,
  options: Omit<ProcessImageOptions, "signal">
): void {
  const temporary = makeTemporaryPath(output);
  const steps = buildVipsSteps(input, output, temporary, options);

  if (steps === null) {
    fs.copyFileSync(input, output);
    return;
  }

  const env = buildVipsEnv(options.vipsCommand);
  try {
    for (const step of steps) {
      spawnSyncChecked(options.vipsCommand, step.args, env);
    }
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}
