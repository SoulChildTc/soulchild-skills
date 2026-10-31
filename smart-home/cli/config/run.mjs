import { exec } from 'child_process';
import { createConfigServer } from './server.mjs';
import { CliError, EXIT } from '../lib/errors.js';

/**
 * 启动配置 Web 服务，打开浏览器，阻塞等待用户配置完成。
 * 用户在页面点"完成配置"（/api/done）后停止服务、输出"配置已结束"。
 * @param {{jsonMode?: boolean}} opts
 */
export function runConfig({ jsonMode = false } = {}) {
  return new Promise((resolve, reject) => {
    let finished = false;
    const finish = (code) => {
      if (finished) return;
      finished = true;
      try { server.closeAllConnections?.(); server.close(); } catch { /* 已关闭 */ }
      if (jsonMode) console.log(JSON.stringify({ ok: code === EXIT.OK, op: 'config' }));
      else console.log('\n✅ 配置已结束');
      resolve(code);
      // 兜底：确保进程退出（HTTP 连接可能仍挂住事件循环）
      setTimeout(() => process.exit(code), 100);
    };

    const server = createConfigServer({ onDone: () => finish(EXIT.OK) });

    server.on('error', (e) => reject(new CliError(EXIT.NETWORK, 'network', `启动配置服务失败: ${e.message}`)));

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const url = `http://127.0.0.1:${port}/`;
      console.log(`▶ 配置页面已启动: ${url}`);
      console.log('▶ 正在打开浏览器…');
      openBrowser(url);
      console.log('▶ 在页面左侧启用要使用的平台并完成登录，完成后点击「完成配置」');
    });
  });
}

function openBrowser(url) {
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'linux' ? 'xdg-open' : process.platform === 'win32' ? 'start' : null;
  if (!opener) { console.log(`▶ 请手动打开: ${url}`); return; }
  try {
    const child = exec(opener === 'start' ? `start "" "${url}"` : `${opener} "${url}"`);
    if (child && child.unref) child.unref();
  } catch { console.log(`▶ 请手动打开: ${url}`); }
}
