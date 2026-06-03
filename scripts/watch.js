const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const esbuild = require("esbuild");

const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const srcUiPath = path.join(rootDir, "src", "ui.html");
const distUiPath = path.join(distDir, "ui.html");
const codeEntryPath = path.join(rootDir, "src", "code.ts");
const codeOutputPath = path.join(distDir, "code.js");

function copyUi() {
  fs.mkdirSync(distDir, { recursive: true });
  fs.copyFileSync(srcUiPath, distUiPath);
  console.log("已同步 dist/ui.html");
}

async function main() {
  let tscPath;

  try {
    tscPath = require.resolve("typescript/bin/tsc");
  } catch {
    console.error("未找到 TypeScript，请先运行 npm install。");
    process.exit(1);
  }

  copyUi();

  const context = await esbuild.context({
    entryPoints: [codeEntryPath],
    outfile: codeOutputPath,
    bundle: true,
    format: "iife",
    target: "es2017",
    platform: "browser",
    logLevel: "info"
  });

  await context.watch();
  console.log("正在监听 TypeScript 和 UI 文件变化...");

  const typeChecker = spawn(process.execPath, [tscPath, "--project", "tsconfig.json", "--watch", "--preserveWatchOutput"], {
    cwd: rootDir,
    stdio: "inherit"
  });

  const uiWatcher = fs.watch(srcUiPath, { persistent: true }, () => {
    copyUi();
  });

  function stop() {
    uiWatcher.close();
    typeChecker.kill();
    context.dispose().finally(() => process.exit(0));
  }

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
