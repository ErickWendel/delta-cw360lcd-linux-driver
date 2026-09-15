import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputs = path.join(root, "outputs");
const runtime = path.join(outputs, "linux-unpacked");
const release = path.join(root, "release");
// The npm package is the importer, while the bundled vendor application has
// its own fixed version and is deliberately kept separate from package.json.
const version = "2.0.11";
const archiveName = `delta-center-linux-compat-${version}-x64.tar.gz`;

if (!fs.existsSync(path.join(runtime, "delta-center"))) {
  throw new Error("outputs/linux-unpacked is missing; run npm run build:linux first");
}
if (!fs.existsSync(path.join(runtime, "resources", "app.asar"))) {
  throw new Error("The assembled app.asar is missing");
}

fs.rmSync(release, { recursive: true, force: true });
fs.mkdirSync(release, { recursive: true });

const archive = path.join(release, archiveName);
const tar = spawnSync("tar", ["-czf", archive, "-C", outputs, "linux-unpacked"], {
  cwd: root,
  stdio: "inherit",
});
if (tar.status !== 0) throw new Error(`tar failed with exit code ${tar.status}`);

for (const file of ["install-on-bazzite.sh", "99-delta-cw360lcd.rules", "BAZZITE-README.md", "CONTINUE-ON-LINUX.md"]) {
  fs.copyFileSync(path.join(outputs, file), path.join(release, file));
}

for (const file of fs.readdirSync(outputs)) {
  if (file.endsWith(".AppImage") || file.endsWith(".deb")) {
    fs.copyFileSync(path.join(outputs, file), path.join(release, file));
  }
}

const checksums = fs.readdirSync(release)
  .filter((file) => file !== "SHA256SUMS.txt" && fs.statSync(path.join(release, file)).isFile())
  .sort()
  .map((file) => `${crypto.createHash("sha256").update(fs.readFileSync(path.join(release, file))).digest("hex")}  ${file}`)
  .join("\n") + "\n";
fs.writeFileSync(path.join(release, "SHA256SUMS.txt"), checksums);
console.log(`Packaged Linux release in ${release}`);
