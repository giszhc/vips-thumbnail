require("esbuild").build({
  entryPoints: ["bin/thumbnail.js"],
  bundle: true,
  platform: "node",
  target: "node18",
  outfile: "dist/thumbnail",
  banner: { js: "#!/usr/bin/env node" }
}).then(() => {
  require("fs").chmodSync("dist/thumbnail", 0o755);
});
