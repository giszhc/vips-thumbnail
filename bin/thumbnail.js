#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function checkVips() {
  try {
    execSync("vips -l", { stdio: "ignore" });
  } catch {
    console.error("❌ libvips not found");
    console.error("👉 install it with: brew install vips");
    process.exit(1);
  }
}

function help() {
  console.log(`
thumbnail - batch compress images using libvips

Usage:
  thumbnail <sourceDir> <outputDir> [options]

Options:
  --quality <1-100>     Compression quality (default: 85)
  --size <number>       Resize max side (optional)
  --ext <.jpg|.png>     Output format (optional)
  --recursive           Scan subdirectories
  -h, --help            Show help

Examples:
  thumbnail ./images ./out --quality 80
  thumbnail ./images ./out --size 400 --quality 80
`);
}

const args = process.argv.slice(2);
if (args.length < 2 || args.includes("-h") || args.includes("--help")) {
  help();
  process.exit(0);
}

checkVips();

const src = path.resolve(args[0]);
const out = path.resolve(args[1]);

let quality = 85;
let size = null;
let ext = "";
let recursive = false;

args.forEach((a, i) => {
  if (a === "--quality") quality = Math.min(100, Math.max(1, Number(args[i + 1]) || 85));
  if (a === "--size") size = Number(args[i + 1]) || null;
  if (a === "--ext") ext = args[i + 1] || "";
  if (a === "--recursive") recursive = true;
});

function walk(dir) {
  let files = [];
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const s = fs.statSync(p);
    if (s.isDirectory() && recursive) files.push(...walk(p));
    if (s.isFile()) files.push(p);
  }
  return files;
}

fs.mkdirSync(out, { recursive: true });

const images = walk(src).filter(f =>
  [".jpg", ".jpeg", ".png"].includes(path.extname(f).toLowerCase())
);

if (!images.length) {
  console.log("⚠️ no images found");
  process.exit(0);
}

images.forEach(img => {
  const inputExt = path.extname(img);
  const outputExt = ext || inputExt;
  const output = path.join(out, path.basename(img, inputExt) + outputExt);

  let cmd;

  if (size) {
    // resize + compress
    cmd = `vips thumbnail "${img}" "${output}" ${size} -Q ${quality}`;
  } else {
    // keep original size, compress only
    cmd = `vips copy "${img}" "${output}" -Q ${quality}`;
  }

  execSync(cmd, { stdio: "inherit" });
});

console.log(`✅ processed ${images.length} images`);
