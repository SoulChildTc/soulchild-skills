import { translateValue } from './capabilities.js';

/** format → 人类可读的类型标签 */
function formatLabel(format) {
  const f = String(format || 'string').toLowerCase();
  if (f === 'bool') return '布尔 true/false';
  if (['int', 'uint8', 'uint16', 'uint32', 'int8', 'int16', 'int32', 'float'].includes(f)) return '数值';
  return '文本';
}

export const formatHuman = {
  list(device, capabilities) {
    console.log(`设备: ${device.name}  (${device.model}, ${device.platform} | id=${device.id})`);
    const setters = capabilities.filter((c) => c.kind === 'set');
    const getters = capabilities.filter((c) => c.kind === 'get');
    const actions = capabilities.filter((c) => c.kind === 'action');
    if (setters.length) {
      console.log('\n可写属性 (--set <名> <值>):');
      for (const c of setters) {
        let line = `  ${c.name}  ${c.desc || ''}`;
        const p = c.params && c.params[0];
        if (p && p.format) line += `  [${formatLabel(p.format)}]`;
        if (p && p.range) {
          line += `  [范围 ${p.range[0]}~${p.range[1]}${p.range[2] && p.range[2] !== 1 ? ` 步进 ${p.range[2]}` : ''}]`;
        }
        if (p && p.values && p.values.length) line += `  [可选 ${p.values.map((v) => `${v.value}=${v.desc}`).join(', ')}]`;
        console.log(line);
      }
    }
    if (getters.length) {
      console.log('\n只读属性 (--get <名>):');
      for (const c of getters) console.log(`  ${c.name}  ${c.desc || ''}${c.values && c.values.length ? `  [${c.values.map((v) => `${v.value}=${v.desc}`).join(', ')}]` : ''}`);
    }
    if (actions.length) {
      console.log('\n动作/按键 (--action <名>):');
      for (const c of actions) {
        let line = `  ${c.name}  ${c.desc || ''}`;
        if (c.params && c.params.length) {
          const pnames = c.params.map((p) => p.name).join('> <');
          line += `  [带参 --action ${c.name} <${pnames}>]`;
        }
        console.log(line);
      }
    }
  },

  result(device, capability, kind, raw, value) {
    if (kind === 'get') {
      console.log(`读取 ${capability.name} →`, JSON.stringify(raw));
      if (value !== undefined) {
        const translated = translateValue(capability, value);
        let line = `  = ${value}`;
        if (translated) line += `（${translated}）`;
        if (capability.unit && capability.unit !== 'none') line += ` ${capability.unit}`;
        console.log(line);
      }
    } else {
      console.log(`操作「${capability.name}」→`, JSON.stringify(raw));
    }
  },
};
