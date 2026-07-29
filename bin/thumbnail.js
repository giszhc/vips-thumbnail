#!/usr/bin/env node

/**
 * thumbnail
 * 基于 libvips 的图片压缩 / 缩略图 CLI
 * 业务逻辑位于 @giszhc/vips-thumbnail-core，与桌面端共用。
 */

const fs = require("fs");
const path = require("path");
const core = require("@giszhc/vips-thumbnail-core");

function fail(message) {
  throw new Error(message);
}

function help() {
  console.log(`
thumbnail - batch image compressor (libvips)

Usage:
  thumbnail <source> <output> [options]

Options:
  --quality <1-100>     压缩质量（默认 85，仅对 JPG 有效）
  --size <number>       最长边尺寸（不传则保持原尺寸）
  --ext <.jpg|.png>     输出格式（可选）
  --recursive           递归处理子目录
  -h, --help            显示帮助

Examples:
  thumbnail a.png out.jpg --quality 80
  thumbnail ./images ./out --size 400 --quality 80
`);
}

function parseArguments(argv) {
  if (argv.length < 2 || argv.includes("-h") || argv.includes("--help")) {
    return null;
  }

  let quality = core.DEFAULT_QUALITY;
  let size = null;
  let ext = null;
  let recursive = false;

  for (let i = 2; i < argv.length; i++) {
    const argument = argv[i];
    if (argument === "--quality") {
      quality = core.validateQuality(Number(argv[++i]));
    } else if (argument === "--size") {
      size = core.validateSize(Number(argv[++i]));
    } else if (argument === "--ext") {
      const value = argv[++i];
      if (!value) fail("--ext 仅支持 .jpg、.jpeg 或 .png");
      ext = core.validateExt(value);
    } else if (argument === "--recursive") {
      recursive = true;
    } else {
      fail(`未知参数：${argument}`);
    }
  }

  return {
    srcPath: path.resolve(argv[0]),
    outPath: path.resolve(argv[1]),
    quality,
    size,
    ext,
    recursive
  };
}

async function resolveVipsCommand() {
  const detector = new core.VipsDetector();

  const system = detector.detectSystem();
  if (system) return system;

  if (process.platform === "win32") {
    if (detector.isWindowsExecutableReady()) {
      return detector.getWindowsPaths().executable;
    }
    console.log(
      `未检测到 libvips，正在自动安装 Windows x64 ${core.VIPS_VERSION}...`
    );
    let lastPercent = -1;
    const executable = await core.installWindowsVips({
      onProgress(progress) {
        if (progress.phase === "download" && progress.percent !== lastPercent) {
          lastPercent = progress.percent;
          if (progress.percent % 10 === 0) {
            console.log(`下载 libvips：${progress.percent}%`);
          }
        }
      }
    });
    console.log(`libvips 已安装到：${detector.getWindowsPaths().installRoot}`);
    return executable;
  }

  fail(core.MISSING_VIPS_MESSAGE);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!options) {
    help();
    return;
  }

  if (!fs.existsSync(options.srcPath)) fail("源路径不存在");
  const vipsCommand = await resolveVipsCommand();

  const srcStat = fs.statSync(options.srcPath);
  if (srcStat.isFile()) {
    if (!core.isSupportedImage(options.srcPath)) fail("暂不支持该文件类型");

    let output;
    if (
      fs.existsSync(options.outPath) &&
      fs.statSync(options.outPath).isDirectory()
    ) {
      const base = path.basename(options.srcPath, path.extname(options.srcPath));
      output = path.join(
        options.outPath,
        base + (options.ext || path.extname(options.srcPath))
      );
    } else {
      output = options.outPath;
    }

    fs.mkdirSync(path.dirname(output), { recursive: true });
    core.processImageSync(options.srcPath, output, {
      vipsCommand,
      quality: options.quality,
      size: options.size,
      ext: options.ext
    });
    console.log("单图片处理完成");
    return;
  }

  if (!srcStat.isDirectory()) fail("源路径既不是文件也不是目录");

  fs.mkdirSync(options.outPath, { recursive: true });
  const images = core
    .walkSync(options.srcPath, options.recursive)
    .filter(core.isSupportedImage);
  if (!images.length) {
    console.log("未找到图片");
    return;
  }

  for (const image of images) {
    const base = path.basename(image, path.extname(image));
    const output = path.join(
      options.outPath,
      base + (options.ext || path.extname(image))
    );
    core.processImageSync(image, output, {
      vipsCommand,
      quality: options.quality,
      size: options.size,
      ext: options.ext
    });
  }

  console.log(`批量处理完成，共 ${images.length} 张图片`);
}

main().catch(error => {
  console.error("错误：", error.message);
  process.exitCode = 1;
});
