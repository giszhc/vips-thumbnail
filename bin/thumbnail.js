#!/usr/bin/env node

/**
 * thumbnail
 * 使用 libvips 批量压缩 / 生成缩略图
 *
 * 规则：
 * - 不传 --size：不改尺寸，只压缩
 * - 传 --size：最长边 resize
 * - JPG/JPEG：jpegsave --Q
 * - PNG：pngsave --compression
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

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

function help() {
  console.log(`
thumbnail - batch image compressor (libvips)

Usage:
  thumbnail <sourceDir> <outputDir> [options]

Options:
  --quality <1-100>     压缩质量（默认 85，仅对 JPG 有效）
  --size <number>       最长边尺寸（不传则保持原尺寸）
  --ext <.jpg|.png>     输出格式（可选）
  --recursive           递归处理子目录
  -h, --help            显示帮助

Examples:
  thumbnail ./images ./out --quality 80
  thumbnail ./images ./out --size 400 --quality 80
`);
}

const argv = process.argv.slice(2);
if (argv.length < 2 || argv.includes("-h") || argv.includes("--help")) {
  help();
  process.exit(0);
}

checkVips();

const srcDir = path.resolve(argv[0]);
const outDir = path.resolve(argv[1]);

if (!fs.existsSync(srcDir)) die("源目录不存在");

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

function isImage(file) {
  return [".jpg", ".jpeg", ".png"].includes(
    path.extname(file).toLowerCase()
  );
}

function processImage(input, output) {
  const tmp = output + ".v";
  const outExt = path.extname(output).toLowerCase();

  // 1️⃣ 处理阶段
  if (size) {
    // 按最长边 resize
    run(`vips thumbnail "${input}" "${tmp}" ${size}`);
  } else {
    // 不改尺寸
    run(`vips resize "${input}" "${tmp}" 1`);
  }

  // 2️⃣ 保存阶段（压缩参数只在这里）
  if (outExt === ".jpg" || outExt === ".jpeg") {
    run(`vips jpegsave "${tmp}" "${output}" --Q=${quality} --strip`);
  } else if (outExt === ".png") {
    run(`vips pngsave "${tmp}" "${output}" --compression=9`);
  } else {
    die(`不支持的输出格式：${outExt}`);
  }

  fs.unlinkSync(tmp);
}

fs.mkdirSync(outDir, { recursive: true });

const images = walk(srcDir).filter(isImage);

if (!images.length) {
  console.log("⚠️ 未找到图片");
  process.exit(0);
}

images.forEach(img => {
  const base = path.basename(img, path.extname(img));
  const outExt = ext || path.extname(img);
  const output = path.join(outDir, base + outExt);
  processImage(img, output);
});

console.log(`✅ 处理完成，共 ${images.length} 张图片`);
