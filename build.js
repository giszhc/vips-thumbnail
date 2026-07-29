const fs = require("fs");
const esbuild = require("esbuild");

async function main() {
  await esbuild.build({
    entryPoints: ["bin/thumbnail.js"],
    bundle: true,
    platform: "node",
    target: "node18",
    outfile: "dist/thumbnail"
  });
  fs.chmodSync("dist/thumbnail", 0o755);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
