import fs from 'fs';
import os from 'os';
import path from 'path';
import { CliError, EXIT } from './errors.js';

export function stateDir() {
  return process.env.SMART_HOME_STATE || path.join(os.homedir(), '.grove', '.data', 'smart-home');
}

/** 平台专属状态目录（凭证/缓存等 per-platform 数据），由框架统一管理 */
export function platformStateDir(platform) {
  return path.join(stateDir(), platform);
}

export function devicesFile() {
  return path.join(stateDir(), 'devices.json');
}

export function loadDevices() {
  if (fs.existsSync(devicesFile())) {
    try { return JSON.parse(fs.readFileSync(devicesFile(), 'utf8')).devices || []; }
    catch { return []; }
  }
  return [];
}

export function saveDevices(devices) {
  fs.writeFileSync(devicesFile(), JSON.stringify({ version: 2, updated: new Date().toISOString(), devices }, null, 2));
}

/**
 * 精确匹配设备名；空数组 = 无匹配。
 * 支持「平台:设备名」精确定位（跨平台同名时用，如 xiaomi:客厅灯）。
 * 仅精确匹配，不做事前猜测——防止包含/模糊匹配误操作到别的设备。
 */
export function findDevices(name) {
  const list = loadDevices();
  // 平台:设备名 语法 → 精确匹配 platform + name
  const colon = name.indexOf(':');
  if (colon > 0) {
    const platform = name.slice(0, colon);
    const devName = name.slice(colon + 1);
    return list.filter((d) => d.platform === platform && d.name === devName);
  }
  return list.filter((d) => d.name === name);
}

/** 设备全名（含平台，供展示/精确定位），如「xiaomi:客厅灯」 */
export function qualifiedName(device) {
  return `${device.platform}:${device.name}`;
}

/** 解析到唯一设备；无匹配抛 DEVICE_NOT_FOUND，多候选抛 AMBIGUOUS（报错带平台全名） */
export function resolveDevice(name) {
  const matches = findDevices(name);
  if (matches.length > 1) {
    throw new CliError(EXIT.AMBIGUOUS, 'ambiguous', `设备名「${name}」匹配到多台（跨平台同名？用 平台:设备名 精确指定）`, { candidates: matches.map((d) => qualifiedName(d)) });
  }
  if (!matches.length) throw new CliError(EXIT.DEVICE_NOT_FOUND, 'device_not_found', `未找到设备「${name}」`);
  return matches[0];
}
