import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadDriver, listPlatforms } from '../lib/platforms.js';
import { CliError } from '../lib/errors.js';
import { readPlatformAuth, setPlatformEnabled } from './lib/auth.js';

const CONFIG_DIR = path.dirname(fileURLToPath(import.meta.url));
const CLI_DIR = path.resolve(CONFIG_DIR, '..');

/**
 * 配置 Web 服务（仅绑定 127.0.0.1）：
 * - GET  /                           → 框架页（左右布局，iframe 嵌平台页）
 * - GET  /platforms/<name>/config/auth.html → 平台配置页（静态文件）
 * - GET  /api/platforms              → 平台列表 {id, displayName, enabled, configPage}
 * - POST /api/platforms/enabled      → body {platform, enabled} 设置启用/禁用
 * - GET/POST /api/<platform>/<action> → 路由到 driver.auth.routes[`${method} /${action}`]
 * - POST /api/done                   → 配置完成，触发 CLI 退出
 */
export function createConfigServer({ onDone, idleTimeoutMs = 120000 } = {}) {
  let lastActivity = Date.now();
  let idleTimer = null;

  const touch = () => { lastActivity = Date.now(); };

  // 空闲超时兜底：页面关闭未触发 beacon（部分浏览器 pagehide 不触发）时强制结束，避免 CLI 永久阻塞
  if (onDone) {
    idleTimer = setInterval(() => {
      if (Date.now() - lastActivity > idleTimeoutMs) {
        clearInterval(idleTimer);
        onDone();
      }
    }, 5000);
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const pathname = url.pathname;
    touch();

    try {
      // 配置完成通知（延迟触发关闭，给页面渲染成功提示的时间）
      if (pathname === '/api/done' && req.method === 'POST') {
        await readBody(req);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true }));
        if (onDone) setTimeout(onDone, 1000);
        return;
      }

      // 平台列表
      if (pathname === '/api/platforms' && req.method === 'GET') {
        const platforms = [];
        for (const id of listPlatforms()) {
          const driver = await loadDriver(id);
          const entry = readPlatformAuth(id);
          platforms.push({
            id,
            displayName: driver.displayName || id,
            enabled: !!entry.enabled,
            configPage: driver.auth?.configPage || null,
          });
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(platforms));
        return;
      }

      // 设置启用/禁用
      if (pathname === '/api/platforms/enabled' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        setPlatformEnabled(body.platform, !!body.enabled);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      // 平台当前配置状态（页面预填充/提示用；不泄露敏感 creds）
      const configMatch = pathname.match(/^\/api\/platforms\/([^/]+)\/config$/);
      if (configMatch && req.method === 'GET') {
        const [, platform] = configMatch;
        const entry = readPlatformAuth(platform);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          enabled: !!entry.enabled,
          configured: !!(entry.creds && Object.keys(entry.creds).length),
        }));
        return;
      }

      // 平台 API：/api/<platform>/<action>
      const apiMatch = pathname.match(/^\/api\/([^/]+)\/([^/]+)$/);
      if (apiMatch) {
        const [, platform, action] = apiMatch;
        const driver = await loadDriver(platform);
        const key = `${req.method} /${action}`;
        const handler = driver.auth?.routes?.[key];
        if (!handler) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: `未定义端点 ${key}` }));
          return;
        }
        const body = ['POST', 'PUT'].includes(req.method) ? JSON.parse((await readBody(req)) || '{}') : undefined;
        const result = await handler(body);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(result ?? { ok: true }));
        return;
      }

      // 静态文件：框架页 / 平台配置页
      if (pathname === '/' || pathname === '/index.html') {
        return serveFile(res, path.join(CONFIG_DIR, 'framework.html'), 'text/html');
      }
      const staticMatch = pathname.match(/^\/platforms\/([^/]+)\/config\/auth\.html$/);
      if (staticMatch) {
        const [, platform] = staticMatch;
        const file = path.join(CLI_DIR, 'platforms', platform, 'config', 'auth.html');
        return serveFile(res, file, 'text/html');
      }

      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: `未知路径 ${pathname}` }));
    } catch (e) {
      res.statusCode = e instanceof CliError ? 400 : 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: e.message }));
    }
  });

  return server;
}

function serveFile(res, file, type) {
  if (!fs.existsSync(file)) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: `文件不存在 ${file}` }));
    return;
  }
  res.setHeader('Content-Type', `${type}; charset=utf-8`);
  res.end(fs.readFileSync(file));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
