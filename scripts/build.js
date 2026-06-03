const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const esbuild = require("esbuild");

const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const srcUiPath = path.join(rootDir, "src", "ui.html");
const distUiPath = path.join(distDir, "ui.html");
const codeEntryPath = path.join(rootDir, "src", "code.ts");
const codeOutputPath = path.join(distDir, "code.js");

function runTypeCheck() {
  let tscPath;

  try {
    tscPath = require.resolve("typescript/bin/tsc");
  } catch {
    console.error("未找到 TypeScript，请先运行 npm install。");
    process.exit(1);
  }

  const result = spawnSync(process.execPath, [tscPath, "--project", "tsconfig.json"], {
    cwd: rootDir,
    stdio: "inherit"
  });

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function copyUi() {
  fs.mkdirSync(distDir, { recursive: true });
  fs.copyFileSync(srcUiPath, distUiPath);
  console.log("已生成 dist/ui.html");
}

function buildCode() {
  fs.mkdirSync(distDir, { recursive: true });

  esbuild.buildSync({
    entryPoints: [codeEntryPath],
    outfile: codeOutputPath,
    bundle: true,
    format: "iife",
    target: "es2017",
    platform: "browser",
    logLevel: "info"
  });
}

runTypeCheck();
buildCode();
copyUi();
console.log("构建完成：dist/code.js 和 dist/ui.html 已就绪。");
