import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { stateDir, saveDevices, findDevices, resolveDevice } from '../lib/registry.js';
import { CliError, EXIT } from '../lib/errors.js';

// 用临时状态目录隔离测试
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sh-test-'));
process.env.SMART_HOME_STATE = TMP;
saveDevices([
  { name: '小米巨省电空调', id: '1', model: 'm1', platform: 'xiaomi' },
  { name: '米家空调 巨省电', id: '2', model: 'm2', platform: 'xiaomi' },
  { name: '客厅投影', id: '3', model: 'm3', platform: 'xiaomi' },
  { name: '客厅灯', id: 'x1', model: 'light', platform: 'xiaomi' },
  { name: '客厅灯', id: 'h1', model: 'light', platform: 'homeassistant' },
]);

test('stateDir 默认指向状态目录', () => {
  assert.equal(stateDir(), TMP);
});

test('精确匹配', () => {
  assert.equal(findDevices('客厅投影').length, 1);
});

test('只精确匹配，包含/模糊不命中', () => {
  assert.equal(findDevices('小明').length, 0);
  assert.equal(findDevices('空调').length, 0);
});

test('跨平台同名 → 匹配到多台', () => {
  assert.equal(findDevices('客厅灯').length, 2);
});

test('平台:设备名 精确定位跨平台同名', () => {
  assert.equal(findDevices('xiaomi:客厅灯').length, 1);
  assert.equal(findDevices('xiaomi:客厅灯')[0].id, 'x1');
  assert.equal(findDevices('homeassistant:客厅灯')[0].id, 'h1');
});

test('resolveDevice 多候选抛 AMBIGUOUS', () => {
  assert.throws(() => resolveDevice('客厅灯'), (e) => e instanceof CliError && e.code === EXIT.AMBIGUOUS);
});

test('resolveDevice 跨平台同名抛 AMBIGUOUS 且报错带平台全名', () => {
  assert.throws(() => resolveDevice('客厅灯'), (e) => e instanceof CliError && e.code === EXIT.AMBIGUOUS && e.data.candidates.includes('xiaomi:客厅灯'));
});

test('resolveDevice 平台前缀精确定位', () => {
  assert.equal(resolveDevice('xiaomi:客厅灯').id, 'x1');
});

test('resolveDevice 未找到抛 DEVICE_NOT_FOUND', () => {
  assert.throws(() => resolveDevice('不存在'), (e) => e instanceof CliError && e.code === EXIT.DEVICE_NOT_FOUND);
});
