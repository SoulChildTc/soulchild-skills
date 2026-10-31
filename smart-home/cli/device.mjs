#!/usr/bin/env node
import { loadDriver, listPlatforms } from './lib/platforms.js';
import { loadDevices, saveDevices, resolveDevice } from './lib/registry.js';
import { CliError, EXIT } from './lib/errors.js';
import { findCapability, normalizeActionParams, translateValue } from './lib/capabilities.js';
import { isPlatformEnabled } from './config/lib/auth.js';
import { formatHuman } from './lib/output.js';
import { HELP } from './help.js';

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');

/** 设备清单里实际出现的平台集合 */
function devicePlatforms() {
  return [...new Set(loadDevices().map((d) => d.platform).filter(Boolean))];
}

async function main() {
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(jsonMode ? JSON.stringify({ ok: true, op: 'help', help: HELP }) : HELP);
    return EXIT.OK;
  }

  if (args.includes('--config')) {
    const { runConfig } = await import('./config/run.mjs');
    return runConfig({ jsonMode });
  }

  if (args.includes('--register')) {
    // 自动遍历所有已启用平台，发现/同步设备（用户无需指定平台）
    const platforms = listPlatforms().filter((p) => isPlatformEnabled(p));
    if (!platforms.length) {
      console.log('没有已启用的平台，请先运行 --config 启用');
      return EXIT.OK;
    }
    const allDevices = [];
    const results = [];
    for (const p of platforms) {
      const driver = await loadDriver(p);
      try {
        const devices = await driver.discover();
        allDevices.push(...devices);
        results.push({ platform: p, total: devices.length, unsupported: devices.filter((d) => d.capabilityStatus === 'unsupported').map((d) => d.name) });
      } catch (e) {
        results.push({ platform: p, total: 0, error: e.message });
      }
    }
    // 按平台分区写 devices.json：保留用户 --rename 的自定义名（同 platform+id 时用现有名），替换其余字段
    // discover 失败/返回 0 台 → 保留该平台现有设备，避免误清空清单
    const existing = loadDevices();
    const keep = existing.filter((d) => !platforms.includes(d.platform));
    const existingMap = new Map(existing.map((d) => [`${d.platform}:${d.id}`, d]));
    const merged = allDevices.map((d) => {
      const prev = existingMap.get(`${d.platform}:${d.id}`);
      return prev ? { ...d, name: prev.name } : d;   // 保留自定义名
    });
    // 成功发现设备的平台 → 用新数据替换；返回 0 台或失败 → 保留现有设备
    const succeededPlatforms = new Set(results.filter((r) => !r.error && r.total > 0).map((r) => r.platform));
    const preserveExisting = existing.filter((d) => platforms.includes(d.platform) && !succeededPlatforms.has(d.platform));
    const devicesById = new Map();
    for (const d of [...keep, ...merged, ...preserveExisting]) devicesById.set(`${d.platform}:${d.id}`, d);
    saveDevices([...devicesById.values()]);
    if (jsonMode) console.log(JSON.stringify({ ok: true, op: 'register', data: { platforms: results, total: allDevices.length } }));
    else {
      const okResults = results.filter((r) => !r.error);
      const failResults = results.filter((r) => r.error);
      for (const r of okResults) {
        const driver = await loadDriver(r.platform);
        const displayName = driver.displayName || r.platform;
        console.log(`✅ ${displayName} 同步完成，共 ${r.total} 台设备`);
        const controllable = r.total - r.unsupported.length;
        if (r.unsupported.length) {
          console.log(`  ⚠️ 不可控制（无能力定义）: ${r.unsupported.join('、')}`);
        }
        console.log(`  ${controllable} 台可控制`);
      }
      for (const r of failResults) {
        const driver = await loadDriver(r.platform);
        console.log(`❌ ${driver.displayName || r.platform} 同步失败: ${r.error}`);
      }
    }
    return EXIT.OK;
  }

  if (args.includes('--status') || args[0] === 'list') {
    const devices = loadDevices();
    // 各平台凭证/启用状态
    const status = {};
    for (const p of devicePlatforms()) {
      const driver = await loadDriver(p);
      const enabled = isPlatformEnabled(p);
      status[p] = { enabled, loggedIn: enabled && driver.isLoggedIn() };
    }
    // 实时在线状态：按平台批量查询（driver 支持则刷新，否则用快照）
    const onlineMap = {};
    const byPlatform = {};
    for (const d of devices) (byPlatform[d.platform] ||= []).push(d);
    for (const [plat, platDevices] of Object.entries(byPlatform)) {
      if (!isPlatformEnabled(plat)) continue;
      const driver = await loadDriver(plat);
      if (typeof driver.refreshOnline === 'function') {
        try { Object.assign(onlineMap, await driver.refreshOnline(platDevices)); } catch { /* 查询失败则用快照 */ }
      }
    }
    if (jsonMode) {
      const enriched = devices.map((d) => ({ ...d, online: onlineMap[d.id] ?? d.online }));
      console.log(JSON.stringify({ ok: true, op: 'list', data: { platforms: status, devices: enriched } }));
      return EXIT.OK;
    }
    // 凭证状态
    for (const [p, s] of Object.entries(status)) {
      if (!s.enabled) console.log(`凭证[${p}]: ⛔ 已禁用（--config 启用）`);
      else console.log(`凭证[${p}]: ${s.loggedIn ? '✅ 已登录' : '❌ 未配置（--config 配置）'}`);
    }
    console.log('');
    // 设备列表（能力/禁用标记）
    if (!devices.length) {
      console.log('（还没有注册设备，运行 node cli/device.mjs --register <平台>）');
      console.log(`\n💡 初始化流程: node cli/device.mjs --config（配置平台） → node cli/device.mjs --register <平台>`);
      return EXIT.OK;
    }
    console.log(`共 ${devices.length} 台设备:`);
    for (const d of devices) {
      if (!isPlatformEnabled(d.platform)) {
        console.log(`  ${d.name} (${d.model}, ${d.platform}) ⛔ 平台已禁用（--config 启用）`);
        continue;
      }
      const driver = await loadDriver(d.platform);
      const caps = await driver.capabilities(d);
      const online = onlineMap[d.id] ?? d.online;
      const onlineMark = caps ? (online ? '🟢 在线' : '⚪ 离线') : '';
      console.log(`  ${d.name} (${d.model}, ${d.platform}) ${onlineMark} ${caps ? '✅ 可控制' : '⚠️ 不支持控制（无需重试）'}`);
    }
    return EXIT.OK;
  }

  if (args.includes('--rename')) {
    // 过滤掉 flag（--json 等），只取位置参数
    const renameArgs = args.slice(args.indexOf('--rename') + 1).filter((a) => !a.startsWith('--'));
    const oldName = renameArgs[0];
    const newName = renameArgs[1];
    if (!oldName || !newName) throw new CliError(EXIT.USAGE, 'usage', '用法: --rename <旧名> <新名>（跨平台同名可用 平台:设备名）');
    if (newName.includes(':')) throw new CliError(EXIT.USAGE, 'usage', '设备名不能包含冒号「:」（用于 平台:设备名 语法）');
    const dev = resolveDevice(oldName);   // 支持平台前缀 + 歧义/未找到报错
    const devices = loadDevices();
    if (devices.some((d) => d.platform === dev.platform && d.name === newName)) {
      throw new CliError(EXIT.USAGE, 'usage', `该平台下已存在同名设备「${newName}」`);
    }
    // resolveDevice 内部重新 loadDevices，返回的对象不在本数组 → 按 platform+id 定位本数组里的对象再改
    const target = devices.find((d) => d.platform === dev.platform && d.id === dev.id);
    if (!target) throw new CliError(EXIT.DEVICE_NOT_FOUND, 'device_not_found', `未找到设备「${oldName}」`);
    target.name = newName;
    saveDevices(devices);
    if (jsonMode) console.log(JSON.stringify({ ok: true, op: 'rename', device: oldName, target: newName }));
    else console.log(`✅ 已改名: ${oldName} → ${newName}`);
    return EXIT.OK;
  }

  if (args.includes('--list') || args.includes('--action') || args.includes('--set') || args.includes('--get')) {
    const name = args.find((a) => !a.startsWith('--'));
    if (!name) throw new CliError(EXIT.USAGE, 'usage', '缺少设备名');
    const device = resolveDevice(name);
    if (!isPlatformEnabled(device.platform)) {
      throw new CliError(EXIT.AUTH, 'auth', `平台「${device.platform}」已禁用，请先运行 --config 启用`);
    }
    const driver = await loadDriver(device.platform);
    const caps = await driver.capabilities(device);
    if (!caps) throw new CliError(EXIT.NOT_SUPPORTED, 'not_supported', `设备「${device.name}」不支持控制`);

    if (args.includes('--list')) {
      if (jsonMode) console.log(JSON.stringify({ ok: true, op: 'caps', device, data: { capabilities: caps } }));
      else formatHuman.list(device, caps);
      return EXIT.OK;
    }

    // 操作 flag 互斥：--action/--set/--get 最多出现一个
    const opFlags = ['--action', '--set', '--get'].filter((f) => args.includes(f));
    if (opFlags.length > 1) {
      throw new CliError(EXIT.USAGE, 'usage', `操作 flag 冲突（${opFlags.join(' / ')}），一次只能用一个`);
    }
    const op = opFlags[0];
    if (!op) throw new CliError(EXIT.USAGE, 'usage', '缺少操作（--action/--set/--get）');

    let kind, requestKind, target, rawParams = {};
    const opIdx = args.indexOf(op);
    if (op === '--action') {
      kind = 'action';
      requestKind = 'action';
      target = args[opIdx + 1];
      if (!target) throw new CliError(EXIT.USAGE, 'usage', '用法: --action <动作>，如: --action play');
    }
    if (op === '--get')    { kind = 'get'; requestKind = 'get'; target = args[opIdx + 1]; if (!target) throw new CliError(EXIT.USAGE, 'usage', '用法: --get <属性>，如: --get volume'); }
    if (op === '--set') {
      kind = 'action'; requestKind = 'set';
      const setArgs = args.slice(opIdx + 1).filter((a) => !a.startsWith('--'));
      if (!setArgs.length) throw new CliError(EXIT.USAGE, 'usage', '用法: --set <属性> <值> [<参数名>=<值>...]，如: --set volume 20 或 --set input-control=4');
      // 第一项 = 能力名（可带 =值，如 volume=20 表示值给第一个参数）
      const first = setArgs[0];
      const firstEq = first.indexOf('=');
      if (firstEq >= 0) {
        target = first.slice(0, firstEq);
        rawParams = { _first: first.slice(firstEq + 1) };
      } else {
        target = first;
        rawParams = {};
      }
      // 后续项：`参数名=值` 直接按参数名赋值；若都无 = 且第二个存在 → 旧式 `--set <属性> <值>`（值给第一个参数）
      const rest = setArgs.slice(1);
      const namedRest = rest.filter((a) => a.includes('='));
      if (rest.length && namedRest.length === rest.length) {
        for (const item of rest) {
          const eq = item.indexOf('=');
          rawParams[item.slice(0, eq)] = item.slice(eq + 1);
        }
      } else if (rest.length === 1 && !rest[0].includes('=')) {
        rawParams._first = rest[0];   // 旧式 `--set <属性> <值>`
      } else if (rest.length > 1 && !namedRest.length) {
        throw new CliError(EXIT.USAGE, 'usage', `参数应为 <参数名>=<值> 形式，如: --set volume 20 或 --set volume value=20`);
      }
    }

    const cap = findCapability(caps, target);
    if (!cap) throw new CliError(EXIT.NOT_SUPPORTED, 'not_supported', `设备「${device.name}」无能力「${target}」（用 --list 查看）`);
    // 能力类型与操作匹配校验：
    //   --get   → 属性可读（set 可写属性也可读、get 只读属性可读），action 不可读
    //   --set   → 仅 set（可写属性）
    //   --action → 仅 action
    if (requestKind === 'get' && cap.kind === 'action') {
      throw new CliError(EXIT.NOT_SUPPORTED, 'not_supported', `设备「${device.name}」的「${target}」不是可读属性（用 --list 查看）`);
    }
    if (requestKind === 'set' && cap.kind !== 'set') {
      throw new CliError(EXIT.NOT_SUPPORTED, 'not_supported', `设备「${device.name}」的「${target}」不是可写属性（用 --list 查看）`);
    }
    if (requestKind === 'action' && cap.kind !== 'action') {
      throw new CliError(EXIT.NOT_SUPPORTED, 'not_supported', `设备「${device.name}」的「${target}」不是动作（用 --list 查看）`);
    }

    // --action: 额外位置参数按顺序映射到能力参数名（如 --action post "你好" → arg0="你好"）
    if (op === '--action' && cap.params) {
      const extraArgs = args.slice(opIdx + 2).filter((a) => !a.startsWith('--'));
      for (let i = 0; i < cap.params.length && i < extraArgs.length; i++) {
        rawParams[cap.params[i].name] = extraArgs[i];
      }
    }

    // 把首参值（_first）赋给能力第一个参数（通常 value）；其余 key=值 直接作为参数
    if (cap.params && cap.params.length && rawParams._first !== undefined) {
      rawParams[cap.params[0].name] = rawParams._first;
    }
    delete rawParams._first;

    // 参数规整（步进自动调整）
    let adjusted = null;
    let params = rawParams;
    if (kind === 'action' && cap.params) {
      const r = normalizeActionParams(cap, rawParams);
      params = r.value;
      adjusted = r.adjusted;
    }

    const raw = await driver.act(device, kind, target, params);

    // 读回翻译
    let readValue, translated;
    if (kind === 'get') {
      readValue = (raw.result && raw.result[0])?.value ?? raw.result?.value;
      translated = translateValue(cap, readValue);
    }

    if (jsonMode) {
      const out = { ok: true, op: requestKind, device, target, params, data: raw };
      if (adjusted) { out.requestedValue = adjusted.requested; out.adjustment = `步进 ${adjusted.step}，已调整为 ${adjusted.adjusted}`; }
      if (readValue !== undefined) { out.value = readValue; if (translated) out.valueDesc = translated; }
      console.log(JSON.stringify(out));
    } else {
      if (adjusted) console.log(`  提示: ${target} 步进为 ${adjusted.step}，已将 ${adjusted.requested} 调整为 ${adjusted.adjusted}`);
      formatHuman.result(device, cap, kind, raw, readValue);
    }
    return EXIT.OK;
  }

  throw new CliError(EXIT.USAGE, 'usage', '用法不识别');
}

try {
  process.exitCode = await main();
} catch (e) {
  if (e instanceof CliError) {
    const detail = e.platformCode ? `（${e.platformCode}）` : '';
    if (jsonMode) console.log(JSON.stringify({ ok: false, op: 'error', error: e.kind, exitCode: e.code, message: e.message + detail, ...(e.platformCode && { platformCode: e.platformCode }), ...(e.data && { data: e.data }) }));
    else {
      console.error(`❌ ${e.message}${detail}`);
      if (e.data && e.data.candidates) for (const c of e.data.candidates) console.error('   - ' + c);
    }
    process.exitCode = e.code;
  } else {
    const msg = e.message || String(e);
    const isAuth = /未找到云凭证|invalid signature|登录凭证校验失败|扫码超时|凭证无效/i.test(msg);
    if (jsonMode) console.log(JSON.stringify({ ok: false, op: 'error', error: isAuth ? 'auth' : 'network', exitCode: isAuth ? EXIT.AUTH : EXIT.NETWORK, message: msg }));
    else console.error('❌ ' + msg);
    process.exitCode = isAuth ? EXIT.AUTH : EXIT.NETWORK;
  }
}
