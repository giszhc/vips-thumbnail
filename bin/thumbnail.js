#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const os = require("os");

function hasVips() {
  try {
    execSync("vips -l", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function help() {
  console.log(`
thumbnail - batch generate image thumbnails

Usage:
  thumbnail <sourceDir> <outputDir> [options]

Options:
  --size <number>     Thumbnail size (default: 400)
  --ext <.png|.jpg>   Output extension
  --recursive         Scan subdirectories
  -h, --help          Show help

Example:
  thumbnail ./images ./out --size 300 --recursive
`);
}

const args = process.argv.slice(2);
if (args.length < 2 || args.includes("-h") || args.includes("--help")) {
  help();
  process.exit(0);
}

if (!hasVips()) {
  console.error("❌ libvips not found");
  console.error("👉 install: brew install vips");
  process.exit(1);
}

const src = path.resolve(args[0]);
const out = path.resolve(args[1]);

let size = 400;
let ext = "";
let recursive = false;

args.forEach((a, i) => {
  if (a === "--size") size = Number(args[i + 1]) || size;
  if (a === "--ext") ext = args[i + 1] || "";
  if (a === "--recursive") recursive = true;
});

function walk(dir) {
  let files = [];
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const stat = fs.statSync(p);
    if (stat.isDirectory() && recursive) files.push(...walk(p));
    if (stat.isFile()) files.push(p);
  }
  return files;
}

fs.mkdirSync(out, { recursive: true });

const images = walk(src).filter(f =>
  [".png", ".jpg", ".jpeg"].includes(path.extname(f).toLowerCase())
);

if (images.length === 0) {
  console.log("⚠️ no images found");
  process.exit(0);
}

images.forEach(img => {
  const e = path.extname(img);
  const o = path.join(out, path.basename(img, e) + (ext || e));
  execSync(`vips thumbnail "${img}" "${o}" ${size}`);
});

console.log(`✅ generated ${images.length} thumbnails`);
