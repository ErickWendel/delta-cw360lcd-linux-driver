"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);
const EMPTY_LAYOUT_KEYS = [
  "vid_list",
  "fanSpeed_list",
  "currentRefreshRate_list",
  "utilization_list",
  "powerDraw_list",
  "temperature_list",
  "name_list",
];

let previousCpu = null;
let previousNetwork = null;
let opened = false;

function sensor(sensorname, value) {
  return { sensorid: null, sensorname, value };
}

function layout(name = null) {
  const result = { sensorid: null, name, serialNum: null };
  for (const key of EMPTY_LAYOUT_KEYS) result[key] = [];
  if (name) result.name_list.push(sensor(name, name));
  return result;
}

function readText(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function readCpuNameAndClock() {
  const cpuinfo = readText("/proc/cpuinfo");
  const name = cpuinfo.match(/^model name\s*:\s*(.+)$/m)?.[1]?.trim() || os.cpus()[0]?.model || "CPU";
  const clocks = [...cpuinfo.matchAll(/^cpu MHz\s*:\s*([0-9.]+)$/gm)].map((match) => Number(match[1]));
  const clock = clocks.length ? clocks.reduce((sum, value) => sum + value, 0) / clocks.length : 0;
  return { name, clock };
}

function readCpuPercent() {
  const fields = readText("/proc/stat").match(/^cpu\s+(.+)$/m)?.[1]?.trim().split(/\s+/).map(Number);
  if (!fields?.length) return 0;
  const idle = (fields[3] || 0) + (fields[4] || 0);
  const total = fields.reduce((sum, value) => sum + value, 0);
  const current = { idle, total };
  if (!previousCpu) {
    previousCpu = current;
    return 0;
  }
  const totalDelta = total - previousCpu.total;
  const idleDelta = idle - previousCpu.idle;
  previousCpu = current;
  return totalDelta > 0 ? Math.max(0, Math.min(100, ((totalDelta - idleDelta) / totalDelta) * 100)) : 0;
}

function readMemory() {
  const values = {};
  for (const line of readText("/proc/meminfo").split("\n")) {
    const match = line.match(/^(\w+):\s+(\d+)/);
    if (match) values[match[1]] = Number(match[2]) * 1024;
  }
  const total = values.MemTotal || os.totalmem();
  const available = values.MemAvailable || values.MemFree || os.freemem();
  const used = Math.max(0, total - available);
  return { total, available, used, percent: total ? (used / total) * 100 : 0 };
}

function readThermalZones() {
  const results = [];
  const base = "/sys/class/thermal";
  try {
    for (const entry of fs.readdirSync(base)) {
      if (!entry.startsWith("thermal_zone")) continue;
      const directory = path.join(base, entry);
      const raw = Number(readText(path.join(directory, "temp")).trim());
      const value = raw > 1000 ? raw / 1000 : raw;
      if (!Number.isFinite(value) || value <= 0 || value >= 150) continue;
      const type = readText(path.join(directory, "type")).trim() || entry;
      results.push(sensor(`${type} Temperature`, value));
    }
  } catch {}
  return results;
}

async function readSensorsCommand() {
  try {
    const { stdout } = await execFileAsync("sensors", ["-j"], { timeout: 1500, windowsHide: true });
    const parsed = JSON.parse(stdout);
    const temperatures = [];
    const fans = [];
    const walk = (value, names = []) => {
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        const nextNames = [...names, key];
        if (typeof child === "number" && /_input$/i.test(key)) {
          const label = names.join(" : ") || key;
          if (/fan/i.test(nextNames.join(" "))) fans.push(sensor(label, child));
          else if (/temp/i.test(nextNames.join(" "))) temperatures.push(sensor(label, child));
        } else if (typeof child === "object") {
          walk(child, nextNames);
        }
      }
    };
    walk(parsed);
    return { temperatures, fans };
  } catch {
    return { temperatures: [], fans: [] };
  }
}

async function readNvidia() {
  try {
    const query = "name,utilization.gpu,temperature.gpu,clocks.current.graphics,power.draw,fan.speed";
    const { stdout } = await execFileAsync(
      "nvidia-smi",
      [`--query-gpu=${query}`, "--format=csv,noheader,nounits"],
      { timeout: 1500, windowsHide: true },
    );
    const [name, utilization, temperature, clock, power, fan] = stdout.trim().split("\n")[0].split(",").map((part) => part.trim());
    return {
      name: name || "NVIDIA GPU",
      utilization: Number(utilization),
      temperature: Number(temperature),
      clock: Number(clock),
      power: Number(power),
      fan: Number(fan),
    };
  } catch {
    return null;
  }
}

function readNetwork() {
  let received = 0;
  let transmitted = 0;
  for (const line of readText("/proc/net/dev").split("\n").slice(2)) {
    const match = line.match(/^\s*([^:]+):\s*(.+)$/);
    if (!match || match[1].trim() === "lo") continue;
    const fields = match[2].trim().split(/\s+/).map(Number);
    received += fields[0] || 0;
    transmitted += fields[8] || 0;
  }
  const now = Date.now();
  const current = { received, transmitted, now };
  if (!previousNetwork) {
    previousNetwork = current;
    return { up: 0, down: 0 };
  }
  const seconds = Math.max(0.001, (now - previousNetwork.now) / 1000);
  const result = {
    up: Math.max(0, transmitted - previousNetwork.transmitted) / seconds / 1024 / 1024,
    down: Math.max(0, received - previousNetwork.received) / seconds / 1024 / 1024,
  };
  previousNetwork = current;
  return result;
}

async function readDisk() {
  try {
    const { stdout } = await execFileAsync("df", ["-kP", "/"], { timeout: 1500, windowsHide: true });
    const fields = stdout.trim().split("\n").at(-1).split(/\s+/);
    const total = Number(fields[1]) * 1024;
    const used = Number(fields[2]) * 1024;
    return { total, used, percent: total ? (used / total) * 100 : 0 };
  } catch {
    return { total: 0, used: 0, percent: 0 };
  }
}

async function open() {
  opened = true;
  previousCpu = null;
  previousNetwork = null;
}

function close() {
  opened = false;
}

async function getSnapshot() {
  if (!opened) await open();
  const [{ temperatures, fans }, gpu, disk] = await Promise.all([
    readSensorsCommand(),
    readNvidia(),
    readDisk(),
  ]);
  const { name: cpuName, clock } = readCpuNameAndClock();
  const cpuPercent = readCpuPercent();
  const memory = readMemory();
  const thermal = temperatures.length ? temperatures : readThermalZones();
  const network = readNetwork();

  const cpuLayout = layout(cpuName);
  cpuLayout.utilization_list.push(sensor(`${cpuName} : Total CPU Usage`, cpuPercent));
  if (clock) cpuLayout.currentRefreshRate_list.push(sensor(`${cpuName} : Average Clock`, clock));
  cpuLayout.temperature_list.push(...thermal);
  cpuLayout.fanSpeed_list.push(...fans);

  const graphics = layout(gpu?.name || "GPU");
  if (gpu) {
    if (Number.isFinite(gpu.utilization)) graphics.utilization_list.push(sensor(`${gpu.name} : GPU Usage`, gpu.utilization));
    if (Number.isFinite(gpu.temperature)) graphics.temperature_list.push(sensor(`${gpu.name} : GPU Temperature`, gpu.temperature));
    if (Number.isFinite(gpu.clock)) graphics.currentRefreshRate_list.push(sensor(`${gpu.name} : GPU Clock`, gpu.clock));
    if (Number.isFinite(gpu.power)) graphics.powerDraw_list.push(sensor(`${gpu.name} : GPU Power`, gpu.power));
    if (Number.isFinite(gpu.fan)) graphics.fanSpeed_list.push(sensor(`${gpu.name} : GPU Fan`, gpu.fan));
  }

  const memLayout = layout("System Memory");
  memLayout.utilization_list.push(sensor("System Memory : Usage", memory.percent));
  memLayout.vid_list.push(sensor("System Memory : Used Bytes", memory.used));

  const diskLayout = layout("Root filesystem");
  diskLayout.utilization_list.push(sensor("Root filesystem : Usage", disk.percent));
  diskLayout.vid_list.push(sensor("Root filesystem : Used Bytes", disk.used));

  const mainBordLayout = layout("Mainboard");
  mainBordLayout.temperature_list.push(...thermal);
  mainBordLayout.fanSpeed_list.push(...fans);

  const fanLayout = layout("Fans");
  fanLayout.fanSpeed_list.push(...fans, ...graphics.fanSpeed_list);

  return {
    baseInfo: { hostname: os.hostname(), systemname: `${os.type()} ${os.release()}` },
    pid: process.pid,
    cpuLayout,
    graphics,
    memLayout,
    diskLayout,
    netInfo: network,
    mainBordLayout,
    unKnowLayout: layout(),
    coolLayout: layout("Cooling"),
    fanLayout,
  };
}

module.exports = { open, close, getSnapshot };
