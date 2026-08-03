import { extractAll, extractFile } from "@electron/asar";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultSource = "C:\\Program Files\\DELTA CENTRO";
const source = path.resolve(process.argv[2] || defaultSource);
const resources = path.join(source, "resources");
const asar = path.join(resources, "app.asar");
const appOut = path.join(root, "work", "vendor-app");
const resourceOut = path.join(root, "work", "vendor-resources");

function fail(message) {
  console.error(`Import failed: ${message}`);
  process.exit(1);
}

function replaceRequired(text, search, replacement, label) {
  const changed = typeof search === "string" ? text.includes(search) : search.test(text);
  if (!changed) fail(`Delta Center layout changed; patch target not found: ${label}`);
  return text.replace(search, replacement);
}

function patchFile(relativePath, transform) {
  const target = path.join(appOut, ...relativePath.split("/"));
  const before = fs.readFileSync(target, "utf8").replace(/\r\n/g, "\n");
  const after = transform(before);
  if (before === after) fail(`Patch made no change: ${relativePath}`);
  fs.writeFileSync(target, after);
  console.log(`Patched ${relativePath}`);
}

if (!fs.existsSync(asar)) fail(`app.asar was not found under ${resources}`);

const manifest = JSON.parse(extractFile(asar, "package.json").toString("utf8"));
if (manifest.name !== "DELTA_CENTRO" || manifest.version !== "2.0.11") {
  fail(`expected DELTA_CENTRO 2.0.11, found ${manifest.name || "unknown"} ${manifest.version || "unknown"}`);
}

fs.rmSync(appOut, { recursive: true, force: true });
fs.rmSync(resourceOut, { recursive: true, force: true });
fs.mkdirSync(appOut, { recursive: true });
fs.mkdirSync(resourceOut, { recursive: true });
extractAll(asar, appOut);

const externalMain = path.join(resources, "main");
if (!fs.existsSync(externalMain)) fail(`external resources were not found at ${externalMain}`);
fs.cpSync(externalMain, path.join(resourceOut, "main"), { recursive: true });
fs.copyFileSync(path.join(root, "patches", "linux-sensors.js"), path.join(appOut, "main", "util", "linux-sensors.js"));

patchFile("main/util/system.js", (text) => {
  text = replaceRequired(
    text,
    "const Exchange = require('./shared-memory-exchange');",
    "const Exchange = process.platform === 'linux' ? null : require('./shared-memory-exchange');\nconst linuxSensors = process.platform === 'linux' ? require('./linux-sensors') : null;",
    "Linux sensor import",
  );
  text = replaceRequired(
    text,
    "async function getText() {\n    let str = {};",
    "async function getText() {\n    if (linuxSensors) return await linuxSensors.getSnapshot();\n    let str = {};",
    "Linux sensor read",
  );
  text = replaceRequired(
    text,
    "    static async open(times = 1, skipKill) {\n        const that = this;",
    "    static async open(times = 1, skipKill) {\n        if (linuxSensors) { await linuxSensors.open(); return; }\n        const that = this;",
    "Linux sensor open",
  );
  text = replaceRequired(
    text,
    "    static close(exeProcess = this?.childPrecess) {\n        // 关闭 DLL",
    "    static close(exeProcess = this?.childPrecess) {\n        if (linuxSensors) { linuxSensors.close(); return; }\n        // 关闭 DLL",
    "Linux sensor close",
  );
  return text;
});

patchFile("main/util/public.js", (text) => {
  text = replaceRequired(
    text,
    "async function installService(openAtLogin, openAsHidden = true) {",
    "async function installService(openAtLogin, openAsHidden = true) {\n  if (process.platform !== 'win32') {\n    app.setLoginItemSettings({ openAtLogin: Boolean(openAtLogin), openAsHidden: Boolean(openAsHidden), args: openAsHidden ? ['--hidden'] : [] });\n    return true;\n  }",
    "cross-platform startup",
  );
  text = replaceRequired(
    text,
    /async function checkForUpdate\(([^)]*)\)\s*\{/,
    "async function checkForUpdate($1) {\n  if (process.platform !== 'win32' || process.env.DELTA_ENABLE_VENDOR_SERVICES !== '1') return;",
    "vendor updater disable",
  );
  return text;
});

patchFile("main/routes/home.js", (text) => {
  if (!text.includes('require("path")')) {
    text = replaceRequired(text, 'const fs = require("fs");', 'const fs = require("fs");\n  const path = require("path");', "path import");
  }
  text = text.replace(/`\$\{commonPath\}\\\\\$\{item\.name\}`/g, "path.join(commonPath, item.name)");
  text = text.replace(
    /`\$\{publicFun\.getPath\(`media\/upload\/\$\{type\}`\)\}\\\\\$\{item\.name\}`/g,
    "path.join(publicFun.getPath(`media/upload/${type}`), item.name)",
  );
  return text;
});

patchFile("main/util/media.js", (text) => {
  text = replaceRequired(
    text,
    "    let ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;\n    let ffprobePath = require('@ffprobe-installer/ffprobe').path;",
    "    let ffmpegPath = process.platform === 'linux' ? (process.env.FFMPEG_PATH || 'ffmpeg') : require('@ffmpeg-installer/ffmpeg').path;\n    let ffprobePath = process.platform === 'linux' ? (process.env.FFPROBE_PATH || 'ffprobe') : require('@ffprobe-installer/ffprobe').path;",
    "Linux FFmpeg lookup",
  );
  return text;
});

const patchedManifest = JSON.parse(fs.readFileSync(path.join(appOut, "package.json"), "utf8"));
patchedManifest.productName = "Delta Center Linux Compatibility";
patchedManifest.description = "Local Linux compatibility build for Delta CW360LCD";
fs.writeFileSync(path.join(appOut, "package.json"), `${JSON.stringify(patchedManifest, null, 2)}\n`);

console.log(`Imported and patched ${manifest.name} ${manifest.version} from ${source}`);
