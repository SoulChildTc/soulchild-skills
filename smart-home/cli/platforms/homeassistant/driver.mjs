import { CliError, EXIT } from '../../lib/errors.js';
import { findCapability } from '../../lib/capabilities.js';
import { readPlatformCreds, savePlatformCreds, readPlatformAuth } from '../../config/lib/auth.js';

export const id = 'homeassistant';
export const displayName = 'Home Assistant';

/**
 * 配置页认证器声明（框架层 config 服务消费）：
 * - configPage：平台自己的配置页 HTML（框架 iframe 加载）
 * - routes：平台登录 API 端点，框架层统一注册到 /api/homeassistant/*
 */
export const auth = {
  configPage: '/platforms/homeassistant/config/auth.html',
  routes: {
    'POST /save': saveForm,         // body { url, token } → 写 auth.json
    'GET /config': readForm,        // 当前配置（脱敏，供页面预填充）
    'POST /test': testConnection,   // body { url, token } → 验证连接/凭证（供配置页保存前测试）
  },
};

/** 测试 HA 连接（用传入的 url/token 调 /api/ 验证）；有效返回 { ok:true }，失败抛错 */
export async function testConnection({ url, token }) {
  if (!url) throw new CliError(EXIT.USAGE, 'usage', '缺少 HA 地址');
  if (!token) throw new CliError(EXIT.USAGE, 'usage', '缺少访问令牌');
  await haCall('GET', '/api/', null, { url: url.replace(/\/$/, ''), token });
  return { ok: true };
}

/** 保存 HA 配置（url/token）到 auth.json；token 留空则保持原令牌 */
export async function saveForm({ url, token }) {
  if (!url) throw new CliError(EXIT.USAGE, 'usage', '缺少 HA 地址');
  let finalToken = token;
  if (!finalToken) {
    const prev = readPlatformAuth('homeassistant').creds?.token;
    if (!prev) throw new CliError(EXIT.USAGE, 'usage', '缺少访问令牌');
    finalToken = prev;
  }
  savePlatformCreds('homeassistant', { url: url.replace(/\/$/, ''), token: finalToken });
  return { ok: true };
}

/** 读取当前配置（url 返回真实值用于预填充；token 脱敏，不泄露明文） */
export function readForm() {
  let cfg = { url: '', tokenMasked: false };
  try {
    const c = readPlatformCreds('homeassistant');
    cfg = { url: c.url || '', tokenMasked: !!(c.token) };
  } catch { /* 未配置 */ }
  return cfg;
}

/**
 * HA 驱动骨架——按统一契约实现，待真实 HA 实例联调。
 * 与米家的差异（无需改框架）：
 *  - 登录：无 OAuth，token 由用户在前端手动生成（Long-Lived Access Token）
 *  - 无 spec：能力清单从 HA 的 domain service 生成
 *  - 错误码：HTTP 状态码 → 中文含义
 */

/** HA HTTP 状态码 → 通用退出码 + 中文含义（平台自管理） */
const HTTP_ERRORS = {
  400: { exit: EXIT.USAGE, kind: 'usage', message: '请求参数错误（HTTP 400）' },
  401: { exit: EXIT.AUTH, kind: 'auth', message: 'HA token 无效或已过期，请到 HA 前端 profile 页重新生成' },
  404: { exit: EXIT.DEVICE_NOT_FOUND, kind: 'device_not_found', message: 'HA 中未找到该实体（entity_id 不存在或已删除）' },
};

/** 常见能力域 → 中文描述补充（可选；能力主体由 /api/services 动态生成） */
const DOMAIN_DESC = {
  light: '灯光',
  switch: '开关',
  media_player: '媒体播放器',
  climate: '空调/温控',
  fan: '风扇',
  cover: '窗帘/门',
  sensor: '传感器',
};

/** 读取 HA 配置（从 auth.json）；缺失抛 AUTH */
function haConfig() {
  const c = readPlatformCreds('homeassistant');
  if (c && c.url && c.token) return { url: c.url.replace(/\/$/, ''), token: c.token };
  throw new CliError(EXIT.AUTH, 'auth', '未配置 HA。请运行: node cli/device.mjs --config');
}

/** 调 HA REST API；非 2xx → CliError（HTTP 状态码 → 中文） */
async function haCall(method, path, body, override) {
  const { url, token } = override || haConfig();
  let res;
  try {
    res = await fetch(`${url}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
  } catch (e) {
    throw new CliError(EXIT.NETWORK, 'network', `无法连接 HA（${url}）：${e.message}`);
  }
  if (res.status >= 200 && res.status < 300) return res.json();
  const def = HTTP_ERRORS[res.status];
  if (def) throw new CliError(def.exit, def.kind, def.message, { platformCode: String(res.status) });
  throw new CliError(EXIT.DEVICE_REJECTED, 'device_rejected', `HA 拒绝操作（HTTP ${res.status}）`, { platformCode: String(res.status) });
}

/** 已登录 = 配置了有效 url + token（由 --config 配置页写入 auth.json） */
export function isLoggedIn() {
  try { haConfig(); return true; } catch { return false; }
}

// ── domain → services 缓存（从 /api/services 动态获取，避免重复请求）──
let servicesCache = null;

/** 拉取所有 domain 支持的 service 列表：{ domain: [service, ...] } */
async function getServices() {
  if (servicesCache) return servicesCache;
  const list = await haCall('GET', '/api/services');
  servicesCache = {};
  for (const d of list) servicesCache[d.domain] = (d.services || []).map((s) => s.service);
  return servicesCache;
}

/** 能力名 → HA service 名的映射（HA service 是下划线，能力名用连字符对齐 CLI 风格） */
function serviceName(capName) {
  return capName.replace(/-/g, '_');
}

/** 生成某 domain 的能力清单：从 /api/services 动态获取，DOMAIN_DESC 补充中文 */
async function domainCapabilities(domain) {
  const services = await getServices();
  const list = services[domain];
  if (!list || !list.length) return null;
  const desc = DOMAIN_DESC[domain];
  return list.map((svc) => ({
    name: svc.replace(/_/g, '-'),   // 能力名用连字符（对齐 CLI/米家风格）
    kind: 'action',
    desc: `${desc || domain} ${svc.replace(/_/g, ' ')}`,  // 如 "灯光 turn on"
  }));
}

export async function discover() {
  // GET /api/states → 每 entity 转设备记录
  const states = await haCall('GET', '/api/states');
  const services = await getServices();
  return states.map((s) => {
    const domain = s.entity_id.split('.')[0];
    return {
      name: s.attributes?.friendly_name || s.entity_id,
      id: s.entity_id,
      model: domain, // HA 无 model 概念，用 domain 代替
      platform: 'homeassistant',
      online: s.state !== 'unavailable',
      capabilityStatus: services[domain] && services[domain].length ? 'ok' : 'unsupported',
    };
  });
}

/** 批量查询设备实时在线状态 → { id: boolean }（HA 实体 unavailable = 离线） */
export async function refreshOnline(devices) {
  const states = await haCall('GET', '/api/states');
  const onlineMap = {};
  for (const s of states) onlineMap[s.entity_id] = s.state !== 'unavailable';
  const out = {};
  for (const dev of devices) out[dev.id] = onlineMap[dev.id] ?? false;
  return out;
}

export async function capabilities(device) {
  // 动态生成：从 /api/services 拿该 domain 的 service 列表
  return domainCapabilities(device.model || device.id.split('.')[0]);
}

/** kind: 'action'|'get'；action 映射到 POST /api/services/<domain>/<service> */
export async function act(device, kind, name, params = {}) {
  const domain = device.model || device.id.split('.')[0];
  const caps = await capabilities(device);
  const cap = caps && findCapability(caps, name);
  if (!cap) throw new CliError(EXIT.NOT_SUPPORTED, 'not_supported', `HA 实体「${device.name}」无能力「${name}」（用 --list 查看）`);

  if (kind === 'get') {
    // GET /api/states/<entity_id> → {state, attributes}
    const st = await haCall('GET', `/api/states/${device.id}`);
    return { code: 0, result: [{ value: st.state }], attributes: st.attributes };
  }

  // action → POST /api/services/<domain>/<service> body {entity_id, ...params}
  const service = serviceName(name); // 能力名连字符 → HA service 下划线
  const body = { entity_id: device.id, ...params };
  const result = await haCall('POST', `/api/services/${domain}/${service}`, body);
  return { code: 0, result, service: `${domain}/${service}`, params: body };
}
