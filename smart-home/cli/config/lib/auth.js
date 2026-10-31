import fs from 'fs';
import path from 'path';
import { stateDir } from '../../lib/registry.js';
import { CliError, EXIT } from '../../lib/errors.js';

/**
 * 统一凭据/配置存储：~/.grove/.data/smart-home/auth.json
 *
 * 结构：
 * {
 *   "xiaomi":        { enabled: true,  creds: { userId, serviceToken, ssecurity, ua } },
 *   "homeassistant": { enabled: false, creds: { url, token } }
 * }
 *
 * - enabled：平台是否启用（框架配置页左侧开关控制）
 * - creds：平台自己的登录凭证（各平台自管语义）
 * 文件权限 0600。
 */

export function authFile() {
  return path.join(stateDir(), 'auth.json');
}

/** 读取全部配置；文件不存在/损坏 → 空对象 */
export function readAuth() {
  const f = authFile();
  if (!fs.existsSync(f)) return {};
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); }
  catch { return {}; }
}

/** 写入全部配置（0600） */
export function writeAuth(data) {
  fs.mkdirSync(path.dirname(authFile()), { recursive: true });
  fs.writeFileSync(authFile(), JSON.stringify(data, null, 2), { mode: 0o600 });
}

/** 读取某平台配置条目；不存在返回 { enabled: false, creds: undefined } */
export function readPlatformAuth(platform) {
  return readAuth()[platform] || { enabled: false };
}

/** 读取某平台是否启用 */
export function isPlatformEnabled(platform) {
  return !!readPlatformAuth(platform).enabled;
}

/** 写入某平台的 creds（不动 enabled 位） */
export function savePlatformCreds(platform, creds) {
  const data = readAuth();
  data[platform] = { ...(data[platform] || {}), enabled: true, creds };
  writeAuth(data);
}

/** 设置某平台启用/禁用 */
export function setPlatformEnabled(platform, enabled) {
  const data = readAuth();
  data[platform] = { ...(data[platform] || {}), enabled };
  writeAuth(data);
}

/** 读取某平台的 creds；未配置抛 AUTH */
export function readPlatformCreds(platform) {
  const entry = readPlatformAuth(platform);
  if (!entry.enabled || !entry.creds) {
    throw new CliError(EXIT.AUTH, 'auth', `平台「${platform}」未配置，请先运行: node cli/device.mjs --config`);
  }
  return entry.creds;
}
