#!/usr/bin/env node

/**
 * thumbnail
 * 基于 libvips 的图片压缩 / 缩略图 CLI
 */

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const WINDOWS_VIPS_VERSION = "8.18.4";
const WINDOWS_VIPS_URL =
  "https://github.com/libvips/build-win64-mxe/releases/download/v8.18.4/vips-dev-x64-all-8.18.4.zip";
const WINDOWS_VIPS_SHA256 =
  "95a56455ac525c9cb64865804322bbacad07021ded8ec49327fa3e392b91935b";
const WINDOWS_VIPS_DIRECTORY = "vips-dev-8.18";

let vipsCommand = "vips";

function fail(message) {
  throw new Error(message);
}

function runVips(args) {
  const result = spawnSync(vipsCommand, args, {
    stdio: "inherit",
    windowsHide: true
  });

  if (result.error) {
    fail(`无法执行 libvips：${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`libvips 执行失败，退出码：${result.status ?? "未知"}`);
  }
}

function canRunVips(command) {
  const result = spawnSync(command, ["--version"], {
    stdio: "ignore",
    windowsHide: true
  });
  return !result.error && result.status === 0;
}

function getWindowsVipsPaths() {
  const localAppData =
    process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  const cacheRoot = path.join(localAppData, "vips-thumbnail", "libvips");
  const installRoot = path.join(cacheRoot, WINDOWS_VIPS_VERSION);
  const executable = path.join(
    installRoot,
    WINDOWS_VIPS_DIRECTORY,
    "bin",
    "vips.exe"
  );
  return { cacheRoot, installRoot, executable };
}

function quotePowerShell(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

function downloadFileOnWindows(url, destination) {
  const command =
    "[Net.ServicePointManager]::SecurityProtocol = " +
    "[Net.SecurityProtocolType]::Tls12; " +
    `Invoke-WebRequest -UseBasicParsing -Uri ${quotePowerShell(url)} ` +
    `-OutFile ${quotePowerShell(destination)}`;
  const result = spawnSync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command],
    { stdio: "inherit", windowsHide: true }
  );

  if (result.error) fail(`无法下载 libvips：${result.error.message}`);
  if (result.status !== 0) fail("下载 libvips 失败");
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function extractZipOnWindows(archive, destination) {
  const command =
    `Expand-Archive -LiteralPath ${quotePowerShell(archive)} ` +
    `-DestinationPath ${quotePowerShell(destination)} -Force`;
  const result = spawnSync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command],
    { stdio: "inherit", windowsHide: true }
  );

  if (result.error) fail(`无法解压 libvips：${result.error.message}`);
  if (result.status !== 0) fail("解压 libvips 失败");
}

async function installWindowsVips() {
  if (process.arch !== "x64") {
    fail(`Windows 自动安装目前仅支持 x64，当前架构为 ${process.arch}`);
  }

  const { cacheRoot, installRoot, executable } = getWindowsVipsPaths();
  fs.mkdirSync(cacheRoot, { recursive: true });
  if (fs.existsSync(installRoot) && !canRunVips(executable)) {
    fs.rmSync(installRoot, { recursive: true, force: true });
  }

  const suffix = `${process.pid}-${Date.now()}`;
  const archive = path.join(cacheRoot, `.vips-${suffix}.zip`);
  const staging = path.join(cacheRoot, `.vips-${suffix}`);

  console.log(`未检测到 libvips，正在自动安装 Windows x64 ${WINDOWS_VIPS_VERSION}...`);
  try {
    downloadFileOnWindows(WINDOWS_VIPS_URL, archive);
    const actualHash = sha256(archive);
    if (actualHash !== WINDOWS_VIPS_SHA256) {
      fail(`libvips 文件校验失败，实际 SHA-256：${actualHash}`);
    }

    fs.mkdirSync(staging);
    extractZipOnWindows(archive, staging);

    const stagedExecutable = path.join(
      staging,
      WINDOWS_VIPS_DIRECTORY,
      "bin",
      "vips.exe"
    );
    if (!fs.existsSync(stagedExecutable)) {
      fail("libvips 压缩包中未找到 vips.exe");
    }

    if (!fs.existsSync(installRoot)) {
      try {
        fs.renameSync(staging, installRoot);
      } catch (error) {
        // 多个进程同时首次安装时，优先复用已经完成的安装。
        if (!fs.existsSync(executable)) throw error;
      }
    }
  } finally {
    fs.rmSync(archive, { force: true });
    fs.rmSync(staging, { recursive: true, force: true });
  }

  if (!canRunVips(executable)) {
    fail(`libvips 已解压但无法运行：${executable}`);
  }
  console.log(`libvips 已安装到：${installRoot}`);
  return executable;
}

async function resolveVipsCommand() {
  if (canRunVips("vips")) return "vips";

  if (process.platform === "win32") {
    const { executable } = getWindowsVipsPaths();
    if (fs.existsSync(executable) && canRunVips(executable)) return executable;
    return installWindowsVips();
  }

  fail(
    "未检测到 libvips。macOS 请执行 `brew install vips`；" +
      "Ubuntu / Debian 请执行 `sudo apt install libvips-tools`。"
  );
}

function isImage(file) {
  return [".jpg", ".jpeg", ".png"].includes(path.extname(file).toLowerCase());
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

  let quality = 85;
  let size = null;
  let ext = null;
  let recursive = false;

  for (let i = 2; i < argv.length; i++) {
    const argument = argv[i];
    if (argument === "--quality") {
      quality = Number(argv[++i]);
      if (!Number.isInteger(quality) || quality < 1 || quality > 100) {
        fail("--quality 必须是 1 到 100 之间的整数");
      }
    } else if (argument === "--size") {
      size = Number(argv[++i]);
      if (!Number.isInteger(size) || size < 1) fail("--size 必须是正整数");
    } else if (argument === "--ext") {
      ext = argv[++i];
      if (!ext || ![".jpg", ".jpeg", ".png"].includes(ext.toLowerCase())) {
        fail("--ext 仅支持 .jpg、.jpeg 或 .png");
      }
      ext = ext.toLowerCase();
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

function processImage(input, output, options) {
  const outExt = path.extname(output).toLowerCase();

  // PNG 不缩放时直接复制，避免重新编码后体积变大。
  if (!options.size && outExt === ".png") {
    fs.copyFileSync(input, output);
    return;
  }

  const temporary = `${output}.v`;
  try {
    if (options.size) {
      runVips(["thumbnail", input, temporary, String(options.size)]);
    } else {
      runVips(["resize", input, temporary, "1"]);
    }

    if (outExt === ".jpg" || outExt === ".jpeg") {
      runVips([
        "jpegsave",
        temporary,
        output,
        `--Q=${options.quality}`,
        "--strip"
      ]);
    } else if (outExt === ".png") {
      runVips(["pngsave", temporary, output, "--compression=9"]);
    } else {
      fail(`不支持的输出格式：${outExt}`);
    }
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function walk(directory, recursive) {
  let list = [];
  for (const file of fs.readdirSync(directory)) {
    const filePath = path.join(directory, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory() && recursive) {
      list = list.concat(walk(filePath, recursive));
    } else if (stat.isFile()) {
      list.push(filePath);
    }
  }
  return list;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!options) {
    help();
    return;
  }

  if (!fs.existsSync(options.srcPath)) fail("源路径不存在");
  vipsCommand = await resolveVipsCommand();

  const srcStat = fs.statSync(options.srcPath);
  if (srcStat.isFile()) {
    if (!isImage(options.srcPath)) fail("暂不支持该文件类型");

    let output;
    if (fs.existsSync(options.outPath) && fs.statSync(options.outPath).isDirectory()) {
      const base = path.basename(options.srcPath, path.extname(options.srcPath));
      output = path.join(options.outPath, base + (options.ext || path.extname(options.srcPath)));
    } else {
      output = options.outPath;
    }

    fs.mkdirSync(path.dirname(output), { recursive: true });
    processImage(options.srcPath, output, options);
    console.log("单图片处理完成");
    return;
  }

  if (!srcStat.isDirectory()) fail("源路径既不是文件也不是目录");

  fs.mkdirSync(options.outPath, { recursive: true });
  const images = walk(options.srcPath, options.recursive).filter(isImage);
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
    processImage(image, output, options);
  }

  console.log(`批量处理完成，共 ${images.length} 张图片`);
}

main().catch(error => {
  console.error("错误：", error.message);
  process.exitCode = 1;
});
