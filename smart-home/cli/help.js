export const HELP = `智能家居统一控制（设备按名，跨平台）
  用法:
    node cli/device.mjs --config            配置平台（打开浏览器：启用平台 + 登录）
    node cli/device.mjs --register        发现/同步所有已启用平台的设备到清单
    node cli/device.mjs list               设备总览（凭证状态 + 设备列表 + 能力/禁用标记）
    node cli/device.mjs --rename <旧名> <新名>  设备改名
    node cli/device.mjs <设备名> --list    设备能力（可写/只读/动作按键清单）
    node cli/device.mjs <设备名> --action <动作> [<参数>...]  调用动作（带参如 --action post "你好"）
    node cli/device.mjs <设备名> --set <属性>=<值> [<参数2>=<值2>...]  写属性（多参用 name=value）
    node cli/device.mjs <设备名> --set <属性> <值>  写属性（单值简写）
    node cli/device.mjs <设备名> --get <属性>  读属性（枚举自动翻译）
    node cli/device.mjs <命令> --json      机器可读输出（配合退出码使用）
  退出码: 0 成功 / 1 用法错误 / 2 设备未找到 / 3 不支持控制 / 4 设备拒绝 / 5 凭证问题 / 6 设备离线 / 7 网络 / 8 名称歧义
  注意: --action/--set/--get 一次只能用一个（遥控键也是动作，用 --action）
  设备名 = 设备清单里的名字（node cli/device.mjs list 查看，--rename 修改）`;
