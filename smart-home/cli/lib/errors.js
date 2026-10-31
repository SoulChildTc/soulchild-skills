export const EXIT = {
  OK: 0,
  USAGE: 1,
  DEVICE_NOT_FOUND: 2,
  NOT_SUPPORTED: 3,
  DEVICE_REJECTED: 4,
  AUTH: 5,
  OFFLINE: 6,
  NETWORK: 7,
  AMBIGUOUS: 8,
};

/**
 * CLI 错误：CLI 层（CliError）与平台驱动（含 platformCode/raw）统一使用。
 * - code：退出码（EXIT.*）
 * - kind：通用错误类型（usage/device_not_found/not_supported/device_rejected/auth/offline/network/ambiguous）
 * - message：中文含义（平台驱动的错误由平台自己生成，含平台错误码 → 中文）
 * - platformCode：平台原始错误码（如 '-704042011' / HTTP '401'），可选
 */
export class CliError extends Error {
  constructor(code, kind, message, data = {}) {
    super(message);
    this.code = code;
    this.kind = kind;
    this.message = message;
    this.data = data;
    this.platformCode = data.platformCode;
    this.raw = data.raw;
  }
}
