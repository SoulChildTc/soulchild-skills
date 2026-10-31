import path from 'path';
import fs from 'fs';
import { MiCloud, qrLogin, requestQr, pollStatus, finalizeLogin } from './scripts/mi_cloud.mjs';
import { fetchAndSave } from './scripts/fetch_spec.mjs';
import { findCapability } from '../../lib/capabilities.js';
import { platformStateDir } from '../../lib/registry.js';
import { CliError, EXIT } from '../../lib/errors.js';

export const id = 'xiaomi';
export const displayName = '米家';

/**
 * 配置页认证器声明（框架层 config 服务消费）：
 * - configPage：平台自己的配置页 HTML（框架 iframe 加载）
 * - routes：平台登录 API 端点，框架层统一注册到 /api/xiaomi/*
 */
export const auth = {
  configPage: '/platforms/xiaomi/config/auth.html',
  routes: {
    'GET /qr': requestQr,           // → { qrUrl, loginUrl }
    'GET /status': pollStatus,      // → { status: 'waiting'|'confirmed' }
    'POST /finalize': finalizeLogin, // → { ok, userId }
  },
};

/** 米家云错误码 → 通用退出码 + 中文含义（平台自管理） */
const MIJIA_ERRORS = {
  '-704042011': { exit: EXIT.OFFLINE, kind: 'offline', message: '设备离线，请确认设备已开机再操作' },
  '-704220043': { exit: EXIT.DEVICE_REJECTED, kind: 'device_rejected', message: 'Property 值错误（设备拒写该属性值）' },
  '-8': { exit: EXIT.DEVICE_REJECTED, kind: 'device_rejected', message: '参数格式错误（data type not valid）' },
};

function specsDir() {
  return path.join(platformStateDir('xiaomi'), 'specs');
}

function specFile(device) {
  return path.join(specsDir(), `${device.model}.json`);
}

export function isLoggedIn() {
  try { MiCloud.load(); return true; } catch { return false; }
}

export async function discover() {
  let mc;
  try { mc = MiCloud.load(); } catch { mc = await qrLogin(); }
  const list = await mc.deviceList();
  const out = [];
  for (const d of list) {
    let capabilityStatus = 'ok';
    if (d.spec_type) {
      try { await fetchAndSave(d.model, d.spec_type, { silent: true }); }
      catch { capabilityStatus = 'unsupported'; }
    } else {
      capabilityStatus = 'unsupported';
    }
    out.push({ name: d.name, id: String(d.did), model: d.model, platform: 'xiaomi', online: d.is_online, capabilityStatus });
  }
  return out;
}

/** 批量查询设备实时在线状态 → { id: boolean } */
export async function refreshOnline(devices) {
  const mc = MiCloud.load();
  const list = await mc.deviceList();
  const onlineMap = {};
  for (const d of list) onlineMap[String(d.did)] = d.is_online;
  const out = {};
  for (const dev of devices) out[dev.id] = onlineMap[dev.id] ?? false;
  return out;
}

function loadSpec(device) {
  const f = specFile(device);
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

/** spec（props/actions/keys 原始结构）→ 纯净能力清单（不含平台私有 mapping） */
function specToCapabilities(spec) {
  const caps = [];
  for (const a of spec.actions || []) {
    caps.push({
      name: a.name, kind: 'action', desc: a.desc || '',
      params: (a.in || []).map((x, i) => ({ name: `arg${i}`, format: x.format, desc: x.name || '' })),
    });
  }
  const seenKeys = new Set();
  for (const k of spec.keys || []) {
    const label = k.name.replace(/^press-/, '');
    if (seenKeys.has(label)) continue; // spec 中同名按键（如 volume-up 按键与自动化）去重
    seenKeys.add(label);
    caps.push({ name: label, kind: 'action', desc: k.desc || '' });
  }
  for (const p of spec.props || []) {
    const writable = p.access && p.access.includes('write');
    const kind = writable ? 'set' : 'get';
    caps.push({
      name: p.name, kind, desc: p.desc || '',
      values: p.values && p.values.length ? p.values : undefined,
      range: p.range || undefined,
      unit: p.unit && p.unit !== 'none' ? p.unit : undefined,
      params: writable ? [{ name: 'value', format: p.format, range: p.range, values: p.values, unit: p.unit }] : undefined,
    });
  }
  return caps;
}

export async function capabilities(device) {
  const spec = loadSpec(device);
  if (!spec) return null;
  return specToCapabilities(spec);
}

/** 按能力名查平台私有 mapping（siid/piid/aiid）；act 内部用，不外泄 */
function resolveMapping(spec, name) {
  for (const a of spec.actions || []) if (a.name === name) return { type: 'action', siid: a.siid, aiid: a.aiid };
  for (const k of spec.keys || []) if (k.name.replace(/^press-/, '') === name) return { type: 'action', siid: k.siid, aiid: k.aiid };
  for (const p of spec.props || []) if (p.name === name) return { type: 'prop', siid: p.siid, piid: p.piid };
  return null;
}

/** 从平台响应提取错误码（设备级 result.code 优先，raw.code 是 API 级，可为 0 而设备失败） */
function extractCode(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  return raw.result?.[0]?.code ?? raw.result?.code ?? raw.code;
}

/** kind: 'action'|'get'；name 为归一化能力名 */
export async function act(device, kind, name, params = {}) {
  const mc = MiCloud.load();
  const spec = loadSpec(device);
  if (!spec) throw new CliError(EXIT.NOT_SUPPORTED, 'not_supported', `设备「${device.name}」不支持控制`);
  const caps = specToCapabilities(spec);
  if (!findCapability(caps, name)) throw new CliError(EXIT.NOT_SUPPORTED, 'not_supported', `设备「${device.name}」无能力「${name}」（用 --list 查看）`);
  const m = resolveMapping(spec, name);
  if (!m) throw new CliError(EXIT.NOT_SUPPORTED, 'not_supported', `设备「${device.name}」无能力「${name}」（用 --list 查看）`);

  let raw;
  if (kind === 'get') {
    raw = await mc.getProp(device.id, m.siid, m.piid);
  } else if (m.type === 'action') {
    // 按 spec 的 in 定义顺序构建入参数组；params 用 arg0/arg1… 作为键（与 specToCapabilities 的命名一致）
    const specAction = spec.actions.find((a) => a.siid === m.siid && a.aiid === m.aiid);
    const inParams = (specAction?.in || []).map((_, i) => params[`arg${i}`]).filter((v) => v !== undefined);
    raw = await mc.action(device.id, m.siid, m.aiid, inParams);
  } else {
    raw = await mc.setProp(device.id, m.siid, m.piid, params.value);
  }

  const code = extractCode(raw);
  const def = code !== undefined && MIJIA_ERRORS[String(code)];
  if (def) throw new CliError(def.exit, def.kind, def.message, { platformCode: String(code), raw });
  // 未知非零错误码 → 一律按设备拒绝处理（退出码 4），避免误报成功
  if (code !== undefined && code !== 0 && code !== '0') {
    throw new CliError(EXIT.DEVICE_REJECTED, 'device_rejected', `设备拒绝操作（错误码 ${code}）`, { platformCode: String(code), raw });
  }
  return raw;
}
