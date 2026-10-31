/** 按归一化能力名在能力清单中查找 */
export function findCapability(list, name) {
  return list.find((c) => c.name === name);
}

/**
 * 规整动作参数：按能力的 params 定义做类型转换/步进规整
 * 返回 { ok, value, adjusted?, message? }
 */
export function normalizeActionParams(capability, rawParams = {}) {
  const params = capability.params || [];
  const out = {};
  let adjusted = null;
  for (const p of params) {
    const raw = rawParams[p.name];
    if (raw === undefined) continue;
    let v = coerce(p.format, raw);
    if (p.range && p.range[2] !== 1 && p.range[2] > 0) {
      const step = p.range[2];
      const num = Number(v);
      if (!Number.isNaN(num) && Math.abs(num % step) > 1e-9) {
        const rounded = Math.round(num / step) * step;
        adjusted = { param: p.name, requested: String(v), adjusted: String(rounded), step };
        v = typeof v === 'number' ? rounded : String(rounded);
      }
    }
    out[p.name] = v;
  }
  return { ok: true, value: out, adjusted };
}

/** 按 spec format 把 CLI 字符串转成目标类型 */
export function coerce(format, value) {
  const f = String(format || 'string').toLowerCase();
  if (['bool'].includes(f)) return ['true', '1', 'on', 'yes'].includes(String(value).toLowerCase());
  if (['int', 'uint8', 'uint16', 'uint32', 'int8', 'int16', 'int32', 'float'].includes(f)) return Number(value);
  return String(value);
}

/** 读回值翻译：按能力的 values 枚举表转中文（如 0 → 停止） */
export function translateValue(capability, value) {
  if (capability && capability.values && capability.values.length) {
    const hit = capability.values.find((v) => v.value === value);
    if (hit) return hit.desc;
  }
  return undefined;
}
