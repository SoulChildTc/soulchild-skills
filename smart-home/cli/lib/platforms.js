import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { CliError, EXIT } from './errors.js';

const CLI_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLATFORMS_DIR = path.join(CLI_DIR, 'platforms');

/** 已安装的平台驱动列表（每个含 driver.mjs 的目录） */
export function listPlatforms() {
  if (!fs.existsSync(PLATFORMS_DIR)) return [];
  return fs.readdirSync(PLATFORMS_DIR)
    .filter((d) => fs.existsSync(path.join(PLATFORMS_DIR, d, 'driver.mjs')))
    .sort();
}

/** 动态加载平台驱动；未知平台抛 NOT_SUPPORTED */
export async function loadDriver(platform) {
  const entry = path.join(PLATFORMS_DIR, platform, 'driver.mjs');
  if (!fs.existsSync(entry)) {
    throw new CliError(EXIT.NOT_SUPPORTED, 'not_supported', `未支持的平台: ${platform}（已安装: ${listPlatforms().join(', ') || '无'}）`);
  }
  return import(pathToFileURL(entry).href);
}
