import test from 'node:test';
import assert from 'node:assert/strict';
import { EXIT, CliError } from '../lib/errors.js';

test('EXIT 契约稳定', () => {
  assert.equal(EXIT.OK, 0);
  assert.equal(EXIT.DEVICE_REJECTED, 4);
  assert.equal(EXIT.AUTH, 5);
  assert.equal(EXIT.AMBIGUOUS, 8);
});

test('CliError 携带 code/kind/中文含义', () => {
  const e = new CliError(EXIT.OFFLINE, 'offline', '设备离线，请确认设备已开机');
  assert.equal(e.code, EXIT.OFFLINE);
  assert.equal(e.kind, 'offline');
  assert.equal(e.message, '设备离线，请确认设备已开机');
  assert.ok(e instanceof Error);
});

test('CliError 支持平台错误码（platformCode/raw 从 data 提取）', () => {
  const e = new CliError(EXIT.OFFLINE, 'offline', '设备离线，请确认设备已开机', { platformCode: '-704042011', raw: { code: 0 } });
  assert.equal(e.platformCode, '-704042011');
  assert.equal(e.raw.code, 0);
  assert.equal(e.data.platformCode, '-704042011');
});
