#!/usr/bin/env node
/**
 * mi_cloud.mjs — 米家云 API 通用层（零 npm 依赖）
 *
 * 从 Xiaomi-cloud-tokens-extractor (Python) 翻译：
 *  - QR 扫码登录（serviceToken + ssecurity 同次登录产生，天然配对，不会 invalid signature）
 *  - miotspec API 调用（action / prop.set / prop.get），不绑定具体设备
 *
 * 用法（作为模块）：
 *   import { MiCloud } from './mi_cloud.mjs';
 *   const mc = await MiCloud.load();                 // 加载/登录（无凭证时触发扫码）
 *   const r = await mc.action(did, siid, aiid);      // 调用动作
 *   const r = await mc.setProp(did, siid, piid, v);  // 写属性
 *   const r = await mc.getProp(did, siid, piid);     // 读属性
 *
 * 用法（CLI）：
 *   node mi_cloud.mjs --login     # 扫码登录并保存凭证
 *   node mi_cloud.mjs --check     # 检查凭证有效性（读设备信息）
 */
import crypto from 'crypto';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { readPlatformCreds, savePlatformCreds } from '../../../config/lib/auth.js';

const APP_BASE = 'https://api.io.mi.com/app';
const ACCOUNT_BASE = 'https://account.xiaomi.com';

// ───────────────────────── RC4（KSA + PRGA，先丢弃 1024 字节，与 Python 版一致）─────────────────────────

function rc4Stream(keyBytes) {
  const S = new Uint8Array(256);
  for (let i = 0; i < 256; i++) S[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + keyBytes[i % keyBytes.length]) & 0xff;
    [S[i], S[j]] = [S[j], S[i]];
  }
  let a = 0;
  j = 0;
  return (data) => {
    const out = Buffer.alloc(data.length);
    for (let k = 0; k < data.length; k++) {
      a = (a + 1) & 0xff;
      j = (j + S[a]) & 0xff;
      [S[a], S[j]] = [S[j], S[a]];
      out[k] = data[k] ^ S[(S[a] + S[j]) & 0xff];
    }
    return out;
  };
}

function encryptRc4(passwordB64, payloadStr) {
  const stream = rc4Stream(Buffer.from(passwordB64, 'base64'));
  stream(Buffer.alloc(1024)); // 丢弃前 1024 字节
  return Buffer.from(stream(Buffer.from(payloadStr, 'utf8'))).toString('base64');
}

function decryptRc4(passwordB64, payloadB64) {
  const stream = rc4Stream(Buffer.from(passwordB64, 'base64'));
  stream(Buffer.alloc(1024));
  return stream(Buffer.from(payloadB64, 'base64'));
}

// ───────────────────────── 签名与加密参数（对齐 token_extractor.py）─────────────────────────

function generateNonce(millis) {
  const buf = crypto.randomBytes(8);
  const t = Buffer.alloc(4);
  t.writeUInt32BE(Math.floor(millis / 60000), 0);
  return Buffer.concat([buf, t]).toString('base64');
}

function signedNonce(ssecurity, nonce) {
  return crypto.createHash('sha256')
    .update(Buffer.concat([Buffer.from(ssecurity, 'base64'), Buffer.from(nonce, 'base64')]))
    .digest('base64');
}

function encSignature(url, method, snonce, params) {
  // url.split('com')[1].replace('/app/','/') → 如 https://api.io.mi.com/app/miotspec/action → /miotspec/action
  const pathPart = url.split('com')[1].replace('/app/', '/');
  const arr = [method.toUpperCase(), pathPart];
  for (const [k, v] of Object.entries(params)) arr.push(`${k}=${v}`);
  arr.push(snonce);
  return crypto.createHash('sha1').update(arr.join('&'), 'utf8').digest('base64');
}

function generateEncParams(url, method, snonce, nonce, params, ssecurity) {
  params.rc4_hash__ = encSignature(url, method, snonce, params);
  for (const [k, v] of Object.entries(params)) {
    params[k] = encryptRc4(snonce, String(v));
  }
  params.signature = encSignature(url, method, snonce, params);
  params.ssecurity = ssecurity;
  params._nonce = nonce;
  return params;
}

// ───────────────────────── HTTP（cookie 收集 + 重定向跟随）─────────────────────────

function parseCookies(setCookieHeaders) {
  const out = {};
  for (const line of setCookieHeaders || []) {
    const kv = line.split(';')[0];
    const eq = kv.indexOf('=');
    if (eq > 0) out[kv.slice(0, eq).trim()] = kv.slice(eq + 1).trim();
  }
  return out;
}

function cookieHeader(cookieMap) {
  return Object.entries(cookieMap).map(([k, v]) => `${k}=${v}`).join('; ');
}

function httpGet(urlStr, { headers = {}, cookieMap = {}, timeout = 30000, raw = false, maxRedirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    let current = urlStr;
    const mergedCookies = { ...cookieMap };

    const doRequest = (redirectsLeft) => {
      const url = new URL(current);
      const lib = url.protocol === 'http:' ? http : https;
      const h = { ...headers };
      if (Object.keys(mergedCookies).length) h.Cookie = cookieHeader(mergedCookies);
      const req = lib.request(url, { method: 'GET', headers: h, timeout }, (res) => {
        // 收集本次响应的 cookie
        Object.assign(mergedCookies, parseCookies(res.headers['set-cookie']));
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks);
          if ([301, 302, 303, 307, 308].includes(res.statusCode) && redirectsLeft > 0 && res.headers.location) {
            current = new URL(res.headers.location, url).toString();
            doRequest(redirectsLeft - 1);
            return;
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            cookies: mergedCookies,
            body,
            text: body.toString('utf8'),
          });
        });
      });
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', reject);
      req.end();
    };
    doRequest(maxRedirects);
  });
}

function httpPost(urlStr, { headers = {}, cookieMap = {}, timeout = 30000, body = '' } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const lib = url.protocol === 'http:' ? http : https;
    const mergedCookies = { ...cookieMap };
    const h = { ...headers };
    if (Object.keys(mergedCookies).length) h.Cookie = cookieHeader(mergedCookies);
    const req = lib.request(url, { method: 'POST', headers: h, timeout }, (res) => {
      Object.assign(mergedCookies, parseCookies(res.headers['set-cookie']));
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        resolve({ status: res.statusCode, headers: res.headers, text: body.toString('utf8'), cookies: mergedCookies });
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function makeUserAgent() {
  const rand = (len, charset) => Array.from({ length: len }, () => charset[Math.floor(Math.random() * charset.length)]).join('');
  const a = rand(13, 'ABCDE');
  const t = rand(18, 'abcdefghijklmnopqrstuvwxyz');
  return `${t}-${a} APP/com.xiaomi.mihome APPV/10.5.201`;
}

// ───────────────────────── 米家云客户端 ─────────────────────────

export class MiCloud {
  constructor({ userId, serviceToken, ssecurity, ua } = {}) {
    this.userId = userId;
    this.serviceToken = serviceToken;
    this.ssecurity = ssecurity;
    this.ua = ua || makeUserAgent();
  }

  /** 加载已保存凭证（从 auth.json），无则抛错 */
  static load() {
    const c = readPlatformCreds('xiaomi');
    return new MiCloud({ userId: c.userId, serviceToken: c.serviceToken, ssecurity: c.ssecurity, ua: c.ua });
  }

  /** 保存凭证到 auth.json */
  save() {
    savePlatformCreds('xiaomi', {
      userId: this.userId, serviceToken: this.serviceToken, ssecurity: this.ssecurity, ua: this.ua,
    });
  }

  get cookies() {
    return {
      userId: String(this.userId),
      yetAnotherServiceToken: String(this.serviceToken),
      serviceToken: String(this.serviceToken),
      locale: 'zh_CN',
      timezone: 'GMT+08:00',
      is_daylight: '0',
      dst_offset: '0',
      channel: 'MI_APP_STORE',
    };
  }

  /** 执行加密 API 调用（miotspec/... 等任意路径） */
  async call(path, data) {
    const url = `${APP_BASE}${path}`;
    const millis = Date.now();
    const nonce = generateNonce(millis);
    const snonce = signedNonce(this.ssecurity, nonce);
    const params = generateEncParams(url, 'POST', snonce, nonce, { data: JSON.stringify(data) }, this.ssecurity);
    const qs = new URLSearchParams(params).toString();
    const headers = {
      'Accept-Encoding': 'identity',
      'User-Agent': this.ua,
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-xiaomi-protocal-flag-cli': 'PROTOCAL-HTTP2',
      'MIOT-ENCRYPT-ALGORITHM': 'ENCRYPT-RC4',
    };
    const r = await httpPost(`${url}?${qs}`, { headers, cookieMap: this.cookies });
    if (r.status !== 200) return { code: -1, message: `HTTP ${r.status}`, raw: r.text.slice(0, 200) };
    const key = signedNonce(this.ssecurity, params._nonce);
    const dec = decryptRc4(key, r.text);
    return JSON.parse(dec.toString('utf8'));
  }

  /** 调用设备动作（params 必须是单个对象，数组会 -8 data type not valid） */
  async action(did, siid, aiid, inParams = []) {
    return this.call('/miotspec/action', { params: { did: String(did), siid, aiid, in: inParams } });
  }

  /** 写属性（params 是数组） */
  async setProp(did, siid, piid, value) {
    return this.call('/miotspec/prop/set', { params: [{ did: String(did), siid, piid, value }] });
  }

  /** 读属性（params 是数组） */
  async getProp(did, siid, piid) {
    return this.call('/miotspec/prop/get', { params: [{ did: String(did), siid, piid }] });
  }

  /** 读设备列表（完整字段，含 spec_type/在线状态） */
    async deviceList() {
      const homes = await this.call('/v2/homeroom/gethome', { fg: true, fetch_share: true, fetch_share_dev: true, limit: 300, app_ver: 7 });
      const out = [];
      for (const home of homes.result?.homelist || []) {
        const devs = await this.call('/v2/home/home_device_list', {
          home_owner: home.owner_id ?? this.userId, home_id: home.id, limit: 200, get_split_device: true, support_smart_home: true,
        });
        for (const d of devs.result?.device_info || []) {
          out.push({
            name: d.name, did: String(d.did), model: d.model, mac: d.mac,
            spec_type: d.spec_type, is_online: d.isOnline, room: d.room_name,
          });
        }
      }
      return out;
    }

  /** 检查凭证是否有效 */
  async check() {
    const r = await this.call('/v2/user/get_device_cnt', { fetch_own: true, fetch_share: true });
    return r && r.code === 0;
  }
}

// ───────────────────────── QR 扫码登录 ─────────────────────────

/** 小米账号接口的 JSON 带 &&&START&&& JSONP 前缀，解析前剥离（对齐 Python to_json） */
function parseApiJson(text) {
  return JSON.parse(String(text).replace('&&&START&&&', '').trim());
}

// ───────────────────────── 登录（拆分为 requestQr / pollStatus / finalize，供配置页 web 调用）─────────────────────────

// 模块级登录会话：requestQr 申请后，pollStatus/finalize 跨请求使用
let pollSession = null;

/**
 * step1+2: 申请二维码，返回入口 URL（供页面展示）
 * @returns {{qrUrl: string, loginUrl: string}}
 */
export async function requestQr() {
  const ua = makeUserAgent();
  const headers = { 'User-Agent': ua, 'Content-Type': 'application/x-www-form-urlencoded' };
  const qs = encodeURIComponent('?sid=xiaomiio&_json=true');
  const callback = encodeURIComponent('https://sts.api.io.mi.com/sts');
  const u1 = `${ACCOUNT_BASE}/longPolling/loginUrl?qs=${qs}&callback=${callback}&sid=xiaomiio&_qrsize=480&_json=true&_hasLogo=false&_locale=zh_CN&_dc=${Date.now()}`;
  const r1 = await httpGet(u1, { headers });
  const d1 = parseApiJson(r1.text);
  if (!d1.qr || !d1.lp) throw new Error(`登录初始化失败: ${JSON.stringify(d1).slice(0, 200)}`);
  pollSession = { ua, headers, lp: d1.lp, timeoutMs: (d1.timeout || 300) * 1000, start: Date.now(), qrUrl: d1.qr, loginUrl: d1.loginUrl };
  return { qrUrl: d1.qr, loginUrl: d1.loginUrl };
}

/**
 * step3: 轮询一次扫码确认状态（页面每隔 ~1s 调一次）
 * @returns {{status: 'waiting'} | {status: 'confirmed'}}
 */
export async function pollStatus() {
  if (!pollSession) throw new Error('未初始化登录（先调用 requestQr）');
  const { headers, lp, timeoutMs, start } = pollSession;
  if (Date.now() - start > timeoutMs) throw new Error('❌ 扫码超时，请重试');
  try {
    const r3 = await httpGet(lp, { headers, timeout: 12000 });
    if (r3.status === 200) {
      const d3 = parseApiJson(r3.text);
      if (d3.ssecurity && d3.location) {
        pollSession.d3 = d3;
        return { status: 'confirmed' };
      }
    }
  } catch { /* 轮询超时，继续 */ }
  return { status: 'waiting' };
}

/**
 * step4: 确认后换 serviceToken + 保存凭证到 auth.json
 * @returns {{ok: true, userId: string}}
 */
export async function finalizeLogin() {
  if (!pollSession || !pollSession.d3) throw new Error('登录尚未确认');
  const { ua, headers, d3 } = pollSession;
  const r4 = await httpGet(d3.location, { headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  const st = r4.cookies.serviceToken;
  const mc = new MiCloud({ userId: d3.userId, serviceToken: st, ssecurity: d3.ssecurity, ua });
  if (!(await mc.check())) throw new Error('❌ 登录凭证校验失败');
  mc.save();
  pollSession = null;
  return { ok: true, userId: d3.userId };
}

/** 兼容旧调用：一步完成（申请→展示→轮询→保存）；CLI 直连场景用 */
export async function qrLogin({ method = 'qr' } = {}) {
  const { qrUrl, loginUrl } = await requestQr();
  const openSafe = (target) => {
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'linux' ? 'xdg-open' : null;
    if (!opener) return false;
    try {
      const child = exec(`${opener} "${target}"`);
      if (child && child.unref) child.unref();
      return true;
    } catch { return false; }
  };
  if (method === 'url') {
    console.log('▶ 请在浏览器打开以下链接，登录米家账号并确认：');
    console.log('  ' + loginUrl);
    if (openSafe(loginUrl)) console.log('  （已尝试自动打开浏览器；未弹出请手动复制上面的链接）');
  } else {
    const img = await httpGet(qrUrl, { headers: pollSession.headers, raw: true });
    const tmp = path.join(os.tmpdir(), 'mi-cloud-qr.png');
    fs.writeFileSync(tmp, img.body);
    console.log('▶ 二维码已保存到:', tmp);
    if (openSafe(tmp)) console.log('  （已尝试自动打开图片；未弹出请手动打开上面的路径）');
    console.log('▶ 请用手机米家 App 扫码');
    console.log('▶ 备用链接（浏览器打开也可）：', loginUrl);
  }
  const { status } = await pollStatus();
  if (status !== 'confirmed') throw new Error('❌ 扫码超时，请重试');
  const { ok, userId } = await finalizeLogin();
  console.log(`✅ 登录成功！凭证已保存（userId=${userId}）`);
  return ok;
}

// ───────────────────────── CLI（仅直接运行时执行，被 import 时不触发）─────────────────────────
const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  const [,, ...argv] = process.argv;

  if (argv.includes('--login')) {
    qrLogin({ method: argv.includes('--url') ? 'url' : 'qr' }).catch((e) => { console.error(e.message); process.exit(1); });
  } else if (argv.includes('--check')) {
    try {
      const mc = MiCloud.load();
      console.log('凭证存在，userId:', mc.userId);
      const ok = await mc.check();
      console.log(ok ? '✅ 凭证有效' : `❌ 凭证无效 (code=${ok})`);
    } catch (e) {
      console.error('❌', e.message);
      process.exit(1);
    }
  } else if (argv.includes('--devices')) {
    try {
      const mc = MiCloud.load();
      const list = await mc.deviceList();
      console.log('=== 米家设备列表 ===');
      for (const d of list) console.log(`  did=${d.did} name=${d.name} model=${d.model} online=${d.is_online}`);
    } catch (e) {
      console.error('❌', e.message);
      process.exit(1);
    }
  }
}