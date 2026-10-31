# 米家平台驱动（xiaomi）

`cli/platforms/xiaomi/` 下的米家驱动实现说明——面向**扩展/调试该平台驱动**的开发者。CLI 用法见项目根目录 `README.md`。

## 文件说明

| 文件 | 角色 |
|---|---|
| `driver.mjs` | 平台驱动入口（实现五件套接口：login/isLoggedIn/discover/capabilities/act） |
| `scripts/mi_cloud.mjs` | 米家云 API：QR 登录 + RC4 签名 + miotspec 调用 |
| `scripts/fetch_spec.mjs` | 从 miot-spec.org 拉型号能力定义 → 状态目录 `specs/` |

## 为什么走云而不是局域网直连

峰米/小明投影仪固件**只认米家云指令**：局域网 miIO 能握手但所有动作/属性被拒（`-4007`，项目记录无官方定义）。云控制**不受局域网限制**——设备在别的家/城市也能控（只要在线）。

## 工作原理

1. **登录**：QR 扫码 → `serviceToken` + `ssecurity`（同次登录才配对，否则 `invalid signature`）→ 存状态目录 `~/.grove/.data/smart-home/xiaomi/`
2. **发现**：`/v2/homeroom/gethome` + `/v2/home/home_device_list` → 设备列表（含 `spec_type` URN）
3. **能力**：`https://miot-spec.org/miot-spec-v2/instance?type=<URN>` → 解析出 props/actions/keys，缓存到状态目录 `specs/`
4. **操作**：`/app/miotspec/action`（params **单个对象**）`/prop/set`、`/prop/get`（params **数组**）——传反返回 `-8 data type not valid`，老路径 `/v2/miot/*` 404

加密细节：RC4（KSA+PRGA，先丢弃 1024 字节）加密参数；签名 = sha256(ssecurity+nonce) 生成 signed_nonce + sha1(method + 路径 + `k=v` 列表 + signed_nonce) 生成 signature；nonce = 随机 8 字节 + 分钟级时间戳 4 字节（base64）。翻译自 [Xiaomi-cloud-tokens-extractor](https://github.com/PiotrMachowski/Xiaomi-cloud-tokens-extractor)。

## 排障（平台级）

| 现象 | 处理 |
|---|---|
| 弹二维码 | 凭证缺失/失效 → 重新 `--config` 登录 |
| `invalid signature` | 凭证不配对 → 删 `~/.grove/.data/smart-home/xiaomi/` 凭证重新登录 |
| 某设备 `能力定义拉取失败` | 该型号在 miot-spec.org 无 spec（如手环）→ 注册仍成功，控制时跳过 |

### 米家错误码（driver 映射到通用退出码）

| 错误码 | 含义 | 退出码 |
|---|---|---|
| `-704042011` | 设备离线 | 6 |
| `-704220043` | Property 值错误（设备拒写该属性值） | 4 |
| `-8` | 参数格式错误（data type not valid） | 4 |

[更多错误码](https://iot.mi.com/v2/new/doc/help-support/faq/spec/error-code)

## 高级手动玩法

- **手动拉能力**：`node cli/platforms/xiaomi/scripts/fetch_spec.mjs <URN>`（如 `urn:miot-spec-v2:device:projector:0000A02C:example-projector-v1:1`）→ 解析成 `specs/<model>.json`
- **手动注册设备**：编辑 `~/.grove/.data/smart-home/devices.json` 加 `platform: "xiaomi"` 条目

> 凭证路径可用 `MI_CLOUD_CREDS=<路径>` 环境变量覆盖；状态目录用 `SMART_HOME_STATE` 重定位。
>
> 实测：`--action volume_up` 生效（音量 10→12）；属性读取/动作调用全部 `code:0`。
