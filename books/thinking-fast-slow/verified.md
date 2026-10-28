# verified.md — 阶段 1.5 三重验证通过的可执行单元

> 验证版本: task-first-v2 | 日期: 2026-09-20
> 输入: candidates/ 5 份共 225 条候选（frameworks 27 / principles 63 / cases 70 / counter-examples 35 / glossary 30）
> 处理方式: framework 与 principle 高度重叠（p08=f11、p14=f09 等），按"可执行单元"合并去重后逐项验证 V1/V2/V3。
> cases / counter-examples / glossary 属支持材料与词典，不在此验证（见 references.md / needs-review.md）。
> V2 均为纸面演练 (walkthrough)；阶段 4 须另做真实输出测试。

## 合并后的可执行单元（28 个）

```yaml
- id: v01
  title: 替代自检（目标问题→启发式问题，含弹出答案验证）
  canonical_ids: [f01, p28, p50]
  source_evidence:
    - location: 第 9 章（fulltext 行 1047-1055）；第 3 章（行 505-515）
  V1_source_sufficiency: { passed: true, reason: 替代机制在第 9 章单处完整定义（目标问题/启发式问题/强度匹配），第 3 章球拍与球提供验证规则；无未解决冲突 }
  V2_executability:
    passed: true
    check_mode: walkthrough
    input: "新输入：'该投这家创业公司吗？'（目标问题），脑中第一个答案是'创始人演讲很打动我'"
    expected: 反推出实际回答的启发式问题是"我喜不喜欢这个创始人"，与目标问题相关性不足
    observed: 按四步可完成反推并识别偷换
  V3_task_utility: { passed: true, expected_benefit: 在预测/评估/说服场景减少答非所问；是多个单元的前置自检 }
  decision: verified
  task_ids: [task-01, task-04, task-05, task-10]

- id: v02
  title: 小数定律 / 样本量自检
  canonical_ids: [f02, p23]
  source_evidence:
    - location: 第 10 章（行 1211, 1243）
  V1: { passed: true, reason: 原文明确提出"极端结果更容易出现在小样本"及"用计算确定样本规模"规则 }
  V2: { passed: true, check_mode: walkthrough, input: "新输入：'新经理上任后团队连续 3 个月达标'", expected: 归因判断应先查样本量与基准分布, observed: 自检步骤可产生"3 个月样本不足，先看同比基准"的结论 }
  V3: { passed: true, expected_benefit: 防止为随机波动编因果故事 }
  missing_conditions: "多大样本算够"无通用阈值，需按领域确定（已在 B 段标注）
  decision: verified
  task_ids: [task-09, task-14]

- id: v03
  title: 锚定效应识别与反制
  canonical_ids: [f03, p19, p30]
  source_evidence:
    - location: 第 11 章（行 1311-1399）；p30 锚定指数公式为原文 55% 例子的直接重建（行 1365-1366）
  V1: { passed: true, reason: 双机制（调整不足/暗示）、反制策略、锚定指数均在原文明确给出；p30 公式书中定义一致 }
  V2:
    passed: true
    check_mode: walkthrough
    input: "新输入：对方谈判先报价 500 万，你的独立估值是 320 万"
    expected: 反制动作=先列支持低值的理由/为对方着想，而非围绕 500 万还价
    observed: 按清单可产出具体反制方案；锚定指数公式对书中例子复算 562/1020=55% ✓
  V3: { passed: true, expected_benefit: 谈判与估测减少被数字拉动；专业人士中招证据充分 }
  decision: verified
  task_ids: [task-06]

- id: v04
  title: 可得性偏见自检（提取轻松度≠频率，含 >100% 贡献率规则）
  canonical_ids: [f04, p27]
  source_evidence:
    - location: 第 12 章（行 1417-1463）
  V1: { passed: true, reason: 定义、扭曲源（媒体/生动/亲身/近期）、施瓦茨 12 件事实验均在原文 }
  V2:
    passed: true
    check_mode: walkthrough
    input: "新输入：'坐飞机安全吗？我刚看了空难新闻'"
    expected: 步骤=识别顺畅度来源→查统计分母→按数据下结论
    observed: 可产出"空难率远低于车祸，新闻画面劫持了提取顺畅度"的结论
  V3: { passed: true, expected_benefit: 风险判断去媒体化；团队归因冲突化解 }
  decision: verified
  task_ids: [task-14, task-15]

- id: v05
  title: 效用层叠与概率忽视 / 罕见事件处置
  canonical_ids: [f05, p26, p46, f16]
  source_evidence:
    - location: 第 13 章（行 1569-1583）、第 30 章（行 3479-3497）
  V1: { passed: true, reason: 效用层叠定义、概率忽视、频率格式转换、完全相加检查均有原文；f16 与 p26/p46 内容同源合并 }
  V2:
    passed: true
    check_mode: walkthrough
    input: "新输入：'每 1000 个用户中有 1 个会遭遇支付故障'，要不要为此上线延迟两周的修复？"
    expected: 换算为 0.1% → 检查是否过度加权 → 与修复成本比较
    observed: 格式转换+分母补全流程可执行
  V3: { passed: true, expected_benefit: 识别媒体/话术驱动的风险放大；政策与安全决策去恐慌化 }
  decision: verified
  task_ids: [task-14]

- id: v06
  title: 贝叶斯两原则 / 基础比率校正（含因果vs统计基础比率、少即是多）
  canonical_ids: [f06, f07, p01, p41, p42, p58, p51]
  source_evidence:
    - location: 第 14 章（行 1719-1725）、第 15 章（行 1895-1901）、第 16 章（行 1937-1943）
  V1: { passed: true, reason: 两原则原文直接给出；因果/统计基础比率区分有出租车问题完整实验；p51（详述降低概率）与 p42（少即是多）机制同源（原型/均值替代累加）合并 }
  V2:
    passed: true
    check_mode: walkthrough
    input: "新输入：某'害羞的诗歌爱好者'更可能学中文系还是工商管理？"
    expected: 从基础比率（工商管理基数远大）出发微调，而非按典型性判断
    observed: 步骤可复算（与书中示例同构）；出租车问题数值 41% 已在原文演算 ✓
  V3: { passed: true, expected_benefit: 归类预测纠正典型性偏差；把统计事实转译为因果形式使其可被采纳 }
  decision: verified
  task_ids: [task-01, task-05, task-14]

- id: v07
  title: 回归平均值校正
  canonical_ids: [f08, p22, p24]
  source_evidence:
    - location: 第 17 章（行 1999-2107）
  V1: { passed: true, reason: 回归原理、成功=天赋+运气分解、飞行教练悖论、四步操作均有原文；p24 公式为概念分解，书中明示 }
  V2:
    passed: true
    check_mode: walkthrough
    input: "新输入：销售冠军上月业绩是均值 3 倍，预测本月"
    expected: 预测向均值收缩，先问"上月的运气成分"
    observed: 四步可产出收缩后的预测；与原文高尔夫示例同构
  V3: { passed: true, expected_benefit: 管理评估/干预归因不再冒领回归效应 }
  decision: verified
  task_ids: [task-09]

- id: v08
  title: 无偏见直觉预测四步法（含置信区间诚实规则）
  canonical_ids: [f09, p14, p34]
  source_evidence:
    - location: 第 18 章（行 2191-2199）；第 24 章（行 2809-2811）
  V1: { passed: true, reason: 四步原文逐字给出；p34 的"4 倍"书中原文明示（行 2811） }
  V2:
    passed: true
    check_mode: walkthrough
    input: "新输入：预测候选人 GPA，同类均值 3.0，直觉匹配值 3.8，关联度估 0.3"
    expected: 预测 = 3.0 + 0.3 × 0.8 = 3.24
    observed: 3.24 ✓（与原文朱莉例同构，公式可直接计算）
  V3: { passed: true, expected_benefit: 招聘/投资/项目预测去极端化；高估/低估概率均衡 }
  decision: verified
  task_ids: [task-01]

- id: v09
  title: 结构化面试与等权公式评分（含评分独立、闭眼直觉、断腿例外）
  canonical_ids: [f10, p12, p13, p57, p43]
  source_evidence:
    - location: 第 21 章（行 2515-2539）；第 7 章评卷（行 887-891）
  V1: { passed: true, reason: 6 特质流程原文完整；p43（公式优先）为同一论证的理论面；p57 断腿规则原文明确（概率极小+结论无歧义才可推翻） }
  V2:
    passed: true
    check_mode: walkthrough
    input: "新输入：为'客服主管'设计结构化面试"
    expected: 产出 6 个独立特质 + 每特质行为问题 + 打分表 + 总分录用规则
    observed: 流程可完整执行；以色列军队实测"从徒劳到有效"为书中结果
  V3: { passed: true, expected_benefit: 招聘决策准确度提升（米尔传统 200 项研究支撑）；防光环效应 }
  decision: verified
  task_ids: [task-01]

- id: v10
  title: 专家直觉可信度判据（K-K 两条件 + 持续性检验 + 自信≠准确）
  canonical_ids: [f11, p07, p08, p53, p25-partial]
  source_evidence:
    - location: 第 22 章（行 2601-2613）；第 20 章（行 2399-2407）
  V1: { passed: true, reason: 两条件原文直接给出（对手合作论文标题级结论）；p53 持续性检验书中以顾问相关系数 0.01 完整示例；p25 的通用换算公式剔除（见 needs-review），仅保留书内锚点（r=0.3→60%）作参考 }
  V2:
    passed: true
    check_mode: walkthrough
    input: "新输入：某'理财大师'声称凭直觉选币种，展示 3 年战绩"
    expected: 评估=环境规律性（汇率短期≈随机）+ 反馈质量 + 跨期相关系数 → 结论不可信
    observed: 判据可执行，产出明确结论与依据
  V3: { passed: true, expected_benefit: 防被伪专家带偏；对自身直觉的期望管理 }
  decision: verified
  task_ids: [task-04]

- id: v11
  title: 外部意见 / 参考类别预测三步法（含非理性坚持检查、竞争忽视）
  canonical_ids: [f12, p15, p47, p44]
  source_evidence:
    - location: 第 23 章（行 2707-2723, 2735）
  V1: { passed: true, reason: 三步原文逐字给出；p47（非理性坚持）为同章自检延伸；p44（竞争忽视）为乐观偏见同族，纳入本单元边界 }
  V2:
    passed: true
    check_mode: walkthrough
    input: "新输入：团队预估开发新功能需 2 个月，已完成 40%"
    expected: 识别参考类别（同类功能开发）→ 取超期分布 → 基准预测 → 个案微调
    observed: 三步可执行；参考类别数据需自备（已标注）
  V3: { passed: true, expected_benefit: 治规划谬误的唯一已验证程序；教科书项目 2 年→实际 8 年为书中代价证据 }
  missing_conditions: 参考类别统计数据获取渠道需用户自备
  decision: verified
  task_ids: [task-02]

- id: v12
  title: 事前验尸（Premortem）
  canonical_ids: [f13, p16]
  source_evidence:
    - location: 第 24 章（行 2829-2833）
  V1: { passed: true, reason: 流程四要素原文逐字给出（时机/参与者/指令/产出），两作用与"非灵丹"边界齐备 }
  V2:
    passed: true
    check_mode: walkthrough
    input: "新输入：产品上线决策会前 1 天"
    expected: 产出=每人独立书面的败因清单 + 讨论修订
    observed: 流程可直接执行，无缺失输入
  V3: { passed: true, expected_benefit: 零门槛高杠杆；合法化怀疑、对抗群体思维 }
  decision: verified
  task_ids: [task-03]

- id: v13
  title: 参照点识别与损失厌恶自检（含"像商人那样思考"）
  canonical_ids: [f14, p02, p32]
  source_evidence:
    - location: 第 26 章（行 3009-3037）、第 27 章（行 3201, 3037）
  V1: { passed: true, reason: 前景理论三特征原文完整；λ=1.5~2.5 书中给出；p32 商人提问为原文（杯子实验验证） }
  V2:
    passed: true
    check_mode: walkthrough
    input: "新输入：自测'输 1000/赢 1500 的赌局接不接'"
    expected: 计算个人 λ，λ≈1.5 时接、λ≈2 时拒；换参照点复评
    observed: 自测与换框均可执行
  V3: { passed: true, expected_benefit: 投资/谈判/止损场景识别损失厌恶驱动的错误决策 }
  decision: verified
  task_ids: [task-05, task-08]

- id: v14
  title: 四重模式定位（含决策权重表、确定性溢价）
  canonical_ids: [f15, p18, p31, p52]
  source_evidence:
    - location: 第 29 章（行 3411-3457, 3361-3391）
  V1: { passed: true, reason: 四象限原文完整；p31 权重表为书中表格逐值转录；p52 为左上/右上象限的应用规则 }
  V2:
    passed: true
    check_mode: walkthrough
    input: "新输入：公司被告，律师评估 95% 败诉，对方索 90% 赔偿金和解"
    expected: 定位右上角（大概率输）→ 预判孤注一掷倾向 → 建议接受和解
    observed: 与原文民事诉讼示例同构，定位可执行
  V3: { passed: true, expected_benefit: 诉讼/医疗/困境企业决策；右上角警示直接防灾难化 }
  decision: verified
  task_ids: [task-05]

- id: v15
  title: 宽框架与风险政策（"有赚有赔"三条件 + 查看频率规则）
  canonical_ids: [f17, p03, p04, p17]
  source_evidence:
    - location: 第 31 章（行 3637-3691）
  V1: { passed: true, reason: 咒语+三条件原文逐字给出；p04（每季度查看）为同章明确建议；p17 风险政策两例书中原例 }
  V2:
    passed: true
    check_mode: walkthrough
    input: "新输入：朋友邀请参与一笔期望值+200 元、可能输 100 元的小赌局"
    expected: 检查三条件（独立/不伤本/非小概率）→ 满足则宽框架接受
    observed: 与萨缪尔森朋友例子同构，条件检查可执行
  V3: { passed: true, expected_benefit: 长期重复风险决策的期望值纠偏；投资者情绪成本下降 }
  decision: verified
  task_ids: [task-05]

- id: v16
  title: 心理账户审计 / 处置效应与沉没成本自检（含后悔不对称）
  canonical_ids: [f18, p21, p37, f19]
  source_evidence:
    - location: 第 32 章（行 3713-3807）
  V1: { passed: true, reason: 审计问句、反事实检验、新 CEO 机制原文齐备；f19（后悔不对称）与 p37 同源合并，92%/88% 数据书中给出 }
  V2:
    passed: true
    check_mode: walkthrough
    input: "新输入：持有亏损 40% 的股票，问卖不卖"
    expected: 问"若今天空仓，会按现价买入吗" → 只看未来预期与税费
    observed: 问句直接可执行，与书中处置效应决策同构
  V3: { passed: true, expected_benefit: 止损/放弃决策剥离沉没成本；处置效应税后代价 3.4%/年为书中量化证据 }
  decision: verified
  task_ids: [task-08]

- id: v17
  title: 框架重构测试（成本≠损失；含道德直觉框架警示）
  canonical_ids: [f21, p20, p55]
  source_evidence:
    - location: 第 34 章（行 3957-3967, 4039-4051）
  V1: { passed: true, reason: 换框架测试原文多例（存活率/死亡率、折扣/附加费、亚洲病害）；p55 谢林免税额悖论为原文完整例 }
  V2:
    passed: true
    check_mode: walkthrough
    input: "新输入：'这个方案有 80% 成功率' vs '有 20% 失败率'，检查自己偏好是否翻转"
    expected: 重写两框架 → 翻转则回到统一（总数）框架重决策
    observed: 测试步骤直接可执行
  V3: { passed: true, expected_benefit: 医疗/消费/政策沟通与自检双用 }
  decision: verified
  task_ids: [task-07]

- id: v18
  title: 单一评估 vs 联合评估
  canonical_ids: [f20, p40]
  source_evidence:
    - location: 第 33 章（行 3837-3841, 3907-3935）
  V1: { passed: true, reason: 偏好逆转机制与"机构应提供宽背景"建议原文明确 }
  V2:
    passed: true
    check_mode: walkthrough
    input: "新输入：单独评审一位候选人的简历打分"
    expected: 引入 2-3 份同类简历并排对比后再定档
    observed: 流程可执行；抢劫案赔偿/陪审团案例支持
  V3: { passed: true, expected_benefit: 招聘/评审/定价判断随情境漂移的校正 }
  decision: verified
  task_ids: [task-07]

- id: v19
  title: 峰终定律与过程忽视（体验设计 vs 体验评估双视角）
  canonical_ids: [f22, p09, p60]
  source_evidence:
    - location: 第 35-36 章（行 4131-4147, 4191-4215）
  V1: { passed: true, reason: 峰终/过程忽视定义、冰手实验、两目标（减记忆痛 vs 减实际痛）分离规则原文完整 }
  V2:
    passed: true
    check_mode: walkthrough
    input: "新输入：设计 3 天客户培训营的日程"
    expected: 压峰值+好结尾；评估过去经历时用"曲线下面积"复核
    observed: 双向规则均可产出具体日程/复盘调整
  V3: { passed: true, expected_benefit: 服务/医疗/活动设计与复盘双用；防"结局毁掉全部"误判 }
  decision: verified
  task_ids: [task-13]

- id: v20
  title: 聚焦错觉校正（情感预测 + 注意力时间账）
  canonical_ids: [f23, p38, p39, p59]
  source_evidence:
    - location: 第 37-38 章（行 4343-4363, 4269-4271, 4289-4293）
  V1: { passed: true, reason: 聚焦错觉定义与加州实验原文完整；p39 阈值书中给出但时效已标注；p59 时间分配建议书中明确 }
  V2:
    passed: true
    check_mode: walkthrough
    input: "新输入：'搬到这套近地铁的房子我会更幸福吗？'"
    expected: 问"一天中有几分钟想到地铁"→ 放回典型一天评估
    observed: 步骤可执行，与加州实验同构
  V3: { passed: true, expected_benefit: 搬城/大件消费/职业选择的情感预测纠偏 }
  missing_conditions: p39 的 $75k 阈值为 2010 年前美国数据，需按通胀/地区调整（入 B 段）
  decision: verified
  task_ids: [task-12]

- id: v21
  title: 独立判断原则（先写后议）
  canonical_ids: [f24, p06]
  source_evidence:
    - location: 第 7 章（行 893-897）
  V1: { passed: true, reason: 原则原文明确（证人规则+会议应用），机制（错误独立→可平均）完整 }
  V2:
    passed: true
    check_mode: walkthrough
    input: "新输入：10 人评审会开始前"
    expected: 每人先独立写简短意见→汇总→讨论
    observed: 流程可直接执行
  V3: { passed: true, expected_benefit: 群体估计精度提升；防强势者锚定全场 }
  decision: verified
  task_ids: [task-11]

- id: v22
  title: 认知放松的操作与反制（说服设计 / 反说服自检）
  canonical_ids: [f25, p05, p29]
  source_evidence:
    - location: 第 5 章（行 675-707, 723）；第 12 章（行 723）
  V1: { passed: true, reason: 四项设计原则原文逐条给出；模糊字体实验、情绪-认知联动书中完整 }
  V2:
    passed: true
    check_mode: walkthrough
    input: "新输入：收到一条'越看越有道理'的投资建议"
    expected: 自问"相信感来自内容还是形式（重复/排版/押韵）" → 追问证据
    observed: 双向清单可执行
  V3: { passed: true, expected_benefit: 写作/营销提升可信度；防骗自检 }
  decision: verified
  task_ids: [task-10]

- id: v23
  title: 公平性参照点分析（让步不对称 / 双向权利）
  canonical_ids: [f26, p36]
  source_evidence:
    - location: 第 28 章（行 3267-3287）
  V1: { passed: true, reason: 公平判据原文明确（不可趁势转嫁损失/可为保护权利转嫁），雪铲/复印店数据支撑 }
  V2:
    passed: true
    check_mode: walkthrough
    input: "新输入：SaaS 公司因服务器涨价想对存量用户提价"
    expected: 参照点分析 → 判定"趁势牟利"还是"成本转嫁" → 设计表述
    observed: 四步可产出公平感风险预测与对策
  V3: { passed: true, expected_benefit: 定价/调薪/改革的公平感风险管理 }
  decision: verified
  task_ids: [task-05, task-06]

- id: v24
  title: 复合事件概率评估（链式高估 / 漏斗式低估）
  canonical_ids: [f27, p51]
  source_evidence:
    - location: 附录 A（行 4573-4575）；第 15 章（行 1797-1803）
  V1: { passed: true, reason: 连续/非连续事件偏差原文完整（附录 A 锚定节）；p51 详述降概率与同一机制（合取）互证 }
  V2:
    passed: true
    check_mode: walkthrough
    input: "新输入：上线计划含 5 个环节，每环节 90% 把握"
    expected: 链式计算 0.9^5 ≈ 59% 而非直觉"接近 90%"
    observed: 计算规则明确可复算 ✓（0.59049）
  V3: { passed: true, expected_benefit: 项目计划与复杂系统风险评估去锚定偏差 }
  decision: verified
  task_ids: [task-02, task-03]

- id: v25
  title: WYSIATI 缺失证据检查
  canonical_ids: [p62]
  source_evidence:
    - location: 第 7 章（行 905-923）
  V1: { passed: true, reason: 明迪克例与"一致性≠完整性"原文直接给出；片面证据更自信的实验支撑 }
  V2:
    passed: true
    check_mode: walkthrough
    input: "新输入：'这位候选人聪明又坚强，适合总监'——还缺什么？"
    expected: 列出关键未知（过往实绩、团队反馈、离职原因），无法列出即预警
    observed: 自问可执行，产出缺失清单
  V3: { passed: true, expected_benefit: 重大判断前强制打开"未知的未知" }
  decision: verified
  task_ids: [task-01, task-04, task-10]

- id: v26
  title: 默认选项设计原则（含勾选方向规则）
  canonical_ids: [p10, p11]
  source_evidence:
    - location: 第 34 章（行 4073-4077, 4097）
  V1: { passed: true, reason: 器官捐献跨国数据与机制（系统 2 懒惰+偏离默认需担责）原文完整；p11 为其表格具体化 }
  V2:
    passed: true
    check_mode: walkthrough
    input: "新输入：设计活动报名表，希望尽量多人报名"
    expected: 报名设为默认（勾选=不参加）；反制方向=识别自己被默认设计
    observed: 设计规则可直接套用
  V3: { passed: true, expected_benefit: 产品/政策设计；同时提供被设计者的自查视角 }
  decision: verified
  task_ids: [task-07]

- id: v27
  title: 叙事谬误与"知道"禁令
  canonical_ids: [p45]
  source_evidence:
    - location: 第 19 章（行 2275-2277, 2269）
  V1: { passed: true, reason: "知道"一词分析原文完整；最终测试（能否事先预测）书中明示 }
  V2:
    passed: true
    check_mode: walkthrough
    input: "新输入：复盘某爆款产品成功原因"
    expected: 先做最终测试（该解释能否事先预测？）→ 运气占比检查
    observed: 测试可执行，与谷歌案例同构
  V3: { passed: true, expected_benefit: 复盘学习质量提升；防止从运气中提炼假教训 }
  decision: verified
  task_ids: [task-04, task-09]

- id: v28
  title: 后见之明防御（按过程评决策）
  canonical_ids: [p48]
  source_evidence:
    - location: 第 19 章（行 2291-2299）
  V1: { passed: true, reason: 结果偏见机制、德卢斯实验（24%→56%）、医生官僚化链条原文完整 }
  V2:
    passed: true
    check_mode: walkthrough
    input: "新输入：评审去年一个失败项目的决策"
    expected: 锁定决策时点信息记录 → 按过程合理性评分而非结果
    observed: 流程可执行（前提：有决策日志，无则记缺口）
  V3: { passed: true, expected_benefit: 组织复盘不被后见之明污染；防决策者过度避险 }
  missing_conditions: 需决策当时的信息记录为前提；无记录时只能部分执行
  decision: verified
  task_ids: [task-03, task-04]

## 验证统计

- 候选总数: 225（去重前）
- 合并后可执行单元: 28（全部 verified，V1/V2/V3 通过）
- 吸收重复候选: 62 条（f/p 重复与同源合并，见 rejected/merged-duplicates.md）
- 转参考材料: 70 案例 + 35 反例 + 29 术语 + 8 独立原则（见 references.md）
- 待核查: 4 条（见 needs-review.md）
- 关键任务覆盖: 15/15 有候选及去向（见 coverage-audit.md），task-15 单薄降为参考
```
