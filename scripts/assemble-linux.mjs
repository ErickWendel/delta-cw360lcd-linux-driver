import { createPackageWithOptions } from "@electron/asar";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appDir = path.join(root, "work", "vendor-app");
const vendorResources = path.join(root, "work", "vendor-resources", "main");
const runtimeDir = path.join(root, "outputs", "linux-unpacked");
const electronBinary = path.join(runtimeDir, "electron");
const appBinary = path.join(runtimeDir, "delta-center");
const resourcesDir = path.join(runtimeDir, "resources");
const zipPath = path.join(root, "work", "electron-v37.9.0-linux-x64.zip");
const electronUrl = "https://github.com/electron/electron/releases/download/v37.9.0/electron-v37.9.0-linux-x64.zip";

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", windowsHide: true });
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
}

async function download(url, destination) {
  console.log(`Downloading ${url}`);
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) throw new Error(`download failed: ${response.status} ${response.statusText}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const file = fs.createWriteStream(destination);
  await new Promise((resolve, reject) => {
    const reader = response.body.getReader();
    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!file.write(Buffer.from(value))) await new Promise((resume) => file.once("drain", resume));
        }
        file.end(resolve);
      } catch (error) {
        file.destroy();
        reject(error);
      }
    };
    pump();
  });
}

async function ensureRuntime() {
  if (fs.existsSync(electronBinary) || fs.existsSync(appBinary)) return;
  await download(electronUrl, zipPath);
  fs.mkdirSync(runtimeDir, { recursive: true });
  if (process.platform === "win32") {
    run("powershell.exe", [
      "-NoProfile",
      "-Command",
      `Expand-Archive -LiteralPath '${zipPath.replaceAll("'", "''")}' -DestinationPath '${runtimeDir.replaceAll("'", "''")}' -Force`,
    ]);
  } else {
    run("unzip", ["-o", zipPath, "-d", runtimeDir]);
  }
}

if (!fs.existsSync(path.join(appDir, "package.json"))) {
  throw new Error("Run the Delta importer before assembling Linux");
}
if (!fs.existsSync(vendorResources)) throw new Error("Imported external Delta resources are missing");

await ensureRuntime();
if (fs.existsSync(electronBinary) && !fs.existsSync(appBinary)) fs.renameSync(electronBinary, appBinary);
fs.mkdirSync(resourcesDir, { recursive: true });

const asarPath = path.join(resourcesDir, "app.asar");
fs.rmSync(asarPath, { force: true });
fs.rmSync(`${asarPath}.unpacked`, { recursive: true, force: true });
await createPackageWithOptions(appDir, asarPath, { unpack: "**/*.node" });

const externalMain = path.join(resourcesDir, "main");
fs.rmSync(externalMain, { recursive: true, force: true });
fs.cpSync(vendorResources, externalMain, { recursive: true });

console.log(`Assembled Linux runtime at ${runtimeDir}`);
