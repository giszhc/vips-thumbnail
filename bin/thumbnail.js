#!/usr/bin/env node

/**
 * thumbnail
 * 基于 libvips 的图片压缩 / 缩略图 CLI
 *
 * 行为规则：
 * - 源是文件 → 单图片处理
 * - 源是目录 → 批量处理
 * - 不传 --size → 不改尺寸，只压缩
 * - JPG：jpegsave --Q
 * - PNG：不 resize 时直接 copy，避免变大
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

/* ---------------- utils ---------------- */

function die(msg) {
  console.error("❌", msg);
  process.exit(1);
}

function run(cmd) {
  execSync(cmd, { stdio: "inherit" });
}

function checkVips() {
  try {
    execSync("vips -l", { stdio: "ignore" });
  } catch {
    die("libvips 未安装，请先执行：brew install vips");
  }
}

function isImage(file) {
  return [".jpg", ".jpeg", ".png"].includes(
    path.extname(file).toLowerCase()
  );
}

/* ---------------- help ---------------- */

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
  # 单图片
  thumbnail a.png out --quality 80
  thumbnail a.png out.jpg --quality 80

  # 批量
  thumbnail ./images ./out --quality 80
  thumbnail ./images ./out --size 400 --quality 80
`);
}

/* ---------------- args ---------------- */

const argv = process.argv.slice(2);
if (argv.length < 2 || argv.includes("-h") || argv.includes("--help")) {
  help();
  process.exit(0);
}

checkVips();

const srcPath = path.resolve(argv[0]);
const outPath = path.resolve(argv[1]);

if (!fs.existsSync(srcPath)) die("源路径不存在");

let quality = 85;
let size = null;
let ext = null;
let recursive = false;

for (let i = 2; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--quality") quality = Number(argv[++i]) || quality;
  else if (a === "--size") size = Number(argv[++i]) || null;
  else if (a === "--ext") ext = argv[++i];
  else if (a === "--recursive") recursive = true;
}

/* ---------------- core ---------------- */

function processImage(input, output) {
  const outExt = path.extname(output).toLowerCase();

  // PNG：不 resize 时直接 copy，避免体积暴涨
  if (!size && outExt === ".png") {
    fs.copyFileSync(input, output);
    return;
  }

  const tmp = output + ".v";

  // 1️⃣ 处理阶段
  if (size) {
    run(`vips thumbnail "${input}" "${tmp}" ${size}`);
  } else {
    run(`vips resize "${input}" "${tmp}" 1`);
  }

  // 2️⃣ 保存阶段
  if (outExt === ".jpg" || outExt === ".jpeg") {
    run(`vips jpegsave "${tmp}" "${output}" --Q=${quality} --strip`);
  } else if (outExt === ".png") {
    run(`vips pngsave "${tmp}" "${output}" --compression=9`);
  } else {
    fs.unlinkSync(tmp);
    die(`不支持的输出格式：${outExt}`);
  }

  fs.unlinkSync(tmp);
}

function walk(dir) {
  let list = [];
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const s = fs.statSync(p);
    if (s.isDirectory() && recursive) {
      list = list.concat(walk(p));
    } else if (s.isFile()) {
      list.push(p);
    }
  }
  return list;
}

/* ---------------- mode detect ---------------- */

const srcStat = fs.statSync(srcPath);

// ===== 单文件模式 =====
if (srcStat.isFile()) {
  if (!isImage(srcPath)) die("暂不支持该文件类型");

  let output;

  if (fs.existsSync(outPath) && fs.statSync(outPath).isDirectory()) {
    const base = path.basename(srcPath, path.extname(srcPath));
    const outExt = ext || path.extname(srcPath);
    output = path.join(outPath, base + outExt);
  } else {
    output = outPath;
  }

  fs.mkdirSync(path.dirname(output), { recursive: true });
  processImage(srcPath, output);

  console.log("✅ 单图片处理完成");
  process.exit(0);
}

// ===== 目录模式 =====
if (!srcStat.isDirectory()) {
  die("源路径既不是文件也不是目录");
}

fs.mkdirSync(outPath, { recursive: true });

const images = walk(srcPath).filter(isImage);

if (!images.length) {
  console.log("⚠️ 未找到图片");
  process.exit(0);
}

images.forEach(img => {
  const base = path.basename(img, path.extname(img));
  const outExt = ext || path.extname(img);
  const output = path.join(outPath, base + outExt);
  processImage(img, output);
});

console.log(`✅ 批量处理完成，共 ${images.length} 张图片`);
