import test from 'node:test';
import assert from 'node:assert/strict';
import { findCapability, normalizeActionParams, translateValue, coerce } from '../lib/capabilities.js';

const list = [
  { name: 'volume', kind: 'set', desc: '音量', params: [{ name: 'value', format: 'uint8', range: [0, 100, 2] }] },
  { name: 'playing-state', kind: 'get', desc: '播放状态', values: [{ value: 0, desc: '停止' }, { value: 1, desc: '播放' }] },
  { name: 'play', kind: 'action', desc: '播放' },
];

test('findCapability 按名查找', () => {
  assert.equal(findCapability(list, 'volume').name, 'volume');
  assert.equal(findCapability(list, 'nope'), undefined);
});

test('normalizeActionParams 步进规整', () => {
  const cap = list[0];
  const r = normalizeActionParams(cap, { value: '21' });
  assert.equal(r.ok, true);
  assert.equal(r.value.value, 22);
  assert.deepEqual(r.adjusted, { param: 'value', requested: '21', adjusted: '22', step: 2 });
});

test('normalizeActionParams 已是步进倍数不调整', () => {
  const cap = list[0];
  const r = normalizeActionParams(cap, { value: '20' });
  assert.equal(r.ok, true);
  assert.equal(r.value.value, 20);
  assert.equal(r.adjusted, null);
});

test('normalizeActionParams 无 params 能力直接通过', () => {
  const r = normalizeActionParams(list[2], {});
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, {});
});

test('normalizeActionParams 缺参数跳过', () => {
  const cap = { name: 'x', kind: 'action', params: [{ name: 'v', format: 'int' }] };
  const r = normalizeActionParams(cap, {});
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, {});
});

test('translateValue 枚举翻译', () => {
  assert.equal(translateValue(list[1], 0), '停止');
  assert.equal(translateValue(list[1], 5), undefined);
  assert.equal(translateValue(list[2], 0), undefined);
});

test('coerce 类型转换', () => {
  assert.equal(coerce('bool', 'true'), true);
  assert.equal(coerce('bool', 'off'), false);
  assert.equal(coerce('int', '20'), 20);
  assert.equal(coerce('float', '12.5'), 12.5);
  assert.equal(coerce('string', 'abc'), 'abc');
});
