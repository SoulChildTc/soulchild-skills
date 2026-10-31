#!/usr/bin/env node
/**
 * fetch_spec.mjs — 从 miot-spec.org 拉取设备能力定义（零 npm 依赖）
 *
 * 把某个型号的 miot-spec（属性/动作/遥控键）解析成精简 JSON，供 device.mjs 通用驱动。
 * 公开数据源，无需米家登录。
 *
 * 用法：
 *   node fetch_spec.mjs <URN>            # 如 urn:miot-spec-v2:device:projector:0000A02C:example-projector-v1:1
 *   node fetch_spec.mjs <model>          # 自动转 URN（需 device_list 的 spec_type 或手动）
 *
 * 输出：specs/<model>.json
 */
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { platformStateDir } from '../../../lib/registry.js';

// 能力缓存：<平台状态目录>/specs/（框架统一管理状态路径）
const SPECS_DIR = path.join(platformStateDir('xiaomi'), 'specs');

/** URN → 能力名：urn:miot-spec-v2:property:volume:xxx... → volume */
function urnName(urn) {
  const parts = String(urn).split(':');
  return parts[3] || parts[parts.length - 2];
}

/** 拉取并解析 miot-spec instance JSON */
async function fetchSpec(urn) {
  return new Promise((resolve, reject) => {
    const url = new URL('https://miot-spec.org/miot-spec-v2/instance');
    url.searchParams.set('type', urn);
    https.get(url, (res) => {
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (e) { reject(new Error(`解析失败: ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

/** instance JSON → 精简能力表 {props, actions, keys} */
export function parseSpec(json) {
  const props = [], actions = [], keys = [];
  for (const svc of json.services || []) {
    const siid = svc.iid ?? svc.siid;
    const svcName = urnName(svc.type);
    for (const p of svc.properties || []) {
      props.push({
        name: urnName(p.type), service: svcName, siid, piid: p.iid ?? p.piid,
        format: p.format, access: p.access || [], range: p['value-range'],
        values: (p['value-list'] || []).map((v) => ({ value: v.value, desc: v.comment || v.description })),
        unit: p.unit, desc: p.comment || p.description,
      });
    }
    for (const a of svc.actions || []) {
      const act = {
        name: urnName(a.type), service: svcName, siid, aiid: a.iid ?? a.aiid,
        in: (a.in || []).map((x) => ({ name: urnName(x.type), format: x.format })),
        desc: a.comment || a.description,
      };
      if (svcName === 'remote-control') keys.push(act);  // 遥控键单独归类
      else actions.push(act);
    }
  }
  return { props, actions, keys };
}

/** 拉取并保存 specs/<model>.json；返回能力表 */
export async function fetchAndSave(model, urn, { silent = false } = {}) {
  const raw = await fetchSpec(urn);
  const spec = { model, type: raw.type, description: raw.description, ...parseSpec(raw) };
  fs.mkdirSync(SPECS_DIR, { recursive: true });
  const out = path.join(SPECS_DIR, `${model}.json`);
  fs.writeFileSync(out, JSON.stringify(spec, null, 2));
  if (!silent) {
    console.log(`✅ 已保存 ${out}`);
    console.log(`   属性 ${spec.props.length} 个 / 动作 ${spec.actions.length} 个 / 遥控键 ${spec.keys.length} 个`);
  }
  return spec;
}

// ── CLI（仅直接运行时执行，被 import 时不触发）──
const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  const [, , ...argv] = process.argv;
  const arg = argv[0];
  if (arg) {
    // 接受 URN 或 model（model 需能猜 URN；register 流程会直接传 spec_type）
    const isUrn = arg.startsWith('urn:');
    const fallbackModel = argv[1];
    fetchAndSave(isUrn ? (fallbackModel || 'unknown-model') : arg, isUrn ? arg : arg)
      .catch((e) => { console.error('❌', e.message); process.exit(1); });
  } else {
    console.log('用法: node fetch_spec.mjs <URN> [model]');
  }
}