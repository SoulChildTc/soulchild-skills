# Home Assistant 平台驱动（homeassistant）

`cli/platforms/homeassistant/` 下的 HA 驱动实现说明——面向**扩展/调试该平台驱动**的开发者。CLI 用法见项目根目录 `README.md`。

> ⚠️ **当前为骨架实现**：驱动契约（login=token / 无 spec / HTTP 错误码→中文）已按框架完成，但 **`discover()`/`act()` 的 HA 调用尚未在真实实例上联调**。需先部署 HA 实例再按本文档验证。

## 前置条件

需要一个**运行中的 Home Assistant 实例**（任一形态）：
- HA OS（树莓派刷入 / x86 小主机）
- HA Container（Docker / NAS）
- HA Core（Python 虚拟环境）

部署参考：<https://www.home-assistant.io/installation/>

## 配置

HA 无需 OAuth 登录——token 由用户在前端手动生成，通过 `--config` 配置页填写：

1. 打开 HA Web 前端：`http://<HA_IP>:8123`
2. 左下角用户名 → **个人资料（Profile）**
3. 底部「长期访问令牌（Long-Lived Access Token）」→ 创建 → 复制

## 契约映射

| 框架契约 | HA 实现 |
|---|---|
| `login` | 无 OAuth，校验 `HA_URL`/`HA_TOKEN` 配置 |
| `discover` | `GET /api/states` → 每 entity 转 `{name: friendly_name, id: entity_id, model: domain}` |
| `capabilities` | **动态生成**：`GET /api/services` 拿该 domain 的 service 列表 → 每个 service 转能力清单项（无 spec） |
| `act(action)` | `POST /api/services/<domain>/<service>` body `{entity_id, ...}`（能力名连字符 → service 下划线） |
| `act(get)` | `GET /api/states/<entity_id>` → state |
| 错误码 | HTTP 401=token 无效 / 404=实体不存在 / 其他非 2xx → 中文 |

## 待完善（有 HA 实例后）

- [ ] `DOMAIN_DESC` 扩充：常见 domain（light/switch/media_player/climate/fan/cover/sensor）之外补充中文描述
- [ ] 能力清单增强：HA 部分 service 支持描述参数（如 media_player/volume_set 的 volume_level），可从 service 描述接口动态补 `params`
- [ ] `--get` 增强：读 state 时把 attributes 里的字段也映射为只读属性
- [ ] 真实联调 `discover()`/`capabilities()`/`act()` 的返回结构

## 参考

- HA REST API 文档：<https://developers.home-assistant.io/docs/api/rest/>
- 统一驱动契约：见项目根目录 `README.md` 的「平台扩展」节