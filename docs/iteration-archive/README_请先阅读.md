# V7.2.10 候选交付：隐藏信息隔离 + 封箱回归门禁修复

本轮只修两项封箱阻断：高手 AI 对手隐藏手牌旁路，以及旧/缺依赖回归门禁。正式入口仍为 `斗鸡_缩域争鸣_V7.2_Map_Phase2_Hotfix候选.html`。

一键自动门禁：`node run_all_regressions.js`。详见 `V7.2.10_候选交付_隐藏信息与回归门禁修复说明.md`。

---

# V7.2.4 PassiveDraw SoftCap

本包基于 V7.2.3 HandOverflow 继续修复本次长局回放暴露出的“被动资源持续制造超量手牌”问题。

正式入口仍为 `斗鸡_缩域争鸣_V7.2_Map_Phase2_Hotfix候选.html`。

核心规则：5张是整备型摸牌的软目标，不是硬上限；【抑制崩坏】与中央资源点的被动摸牌不再把已有5+手牌继续顶高，但主动摸牌仍可超过5张。

详见 `V7.2.4_对局问题诊断与被动摸牌软上限修复说明.md`。

---

# V7.2.2 MovementDirection

本包在 V7.2.1 障碍/高差可视化版本之上继续修复“移动方向选择与实际结算不一致”问题。
正式入口仍为 `斗鸡_缩域争鸣_V7.2_Map_Phase2_Hotfix候选.html`。

重点变化：移动牌、移动技能、战术步与闪避反击的玩家选择优先使用 Core legal action；
闪避类反击现在只显示真正能远离对手的合法格，并严格执行玩家选择的路径；
多步移动动画按真实路径逐格播放。

---

# V7.2 MovementResolver 统一移动最终修复版

**正式入口：** `斗鸡_缩域争鸣_V7.2_Map_Phase2_Hotfix候选.html`

本轮在 Map Phase2 Hotfix / Phase3 九角色回归基础上完成移动架构最后收口：主动选路、自动接近、自动后退、游步、技能移动、绝技突进、击退与缩域迁移统一进入 `MovementResolver`；`VOLUNTARY / APPROACH / RETREAT` 统一使用 `edge.cost` 移动力预算；Occupancy 统一为地图规则入口并预留 `MapState.entities`。

验证：`v7.2_movement_resolver_regression.js` 6/6 PASS；`v7.2_map_phase2_hotfix_regression.js` 10/10 PASS；`v7.2_stage3_nine_role_signature_regression.js` 整体 PASS。详见 `V7.2_MovementResolver_统一移动修复说明.md`。

---

# V7.2 Map Phase 2 / Golden Master 封箱候选

**正式入口：** `斗鸡_缩域争鸣_V7.2_Map_Core_法尤姆修复版.html`

本轮已把移动寻路、地图目标、危险区与缩域规则读取进一步迁出旧 `board`，由 `MapState` 作为规则事实源；`board` 仅保留初始化与兼容镜像。详见 `V7.2_Map_Phase2_迁移与GoldenMaster封箱说明.md`。

---

# V7.2 Map Core / 法尤姆闭合候选

**正式入口：** `斗鸡_缩域争鸣_V7.2_Map_Core_法尤姆修复版.html`

详见 `V7.2_Map_Core_法尤姆闭合说明.md`。

---

# V7.1.3 ResponseWindow / 地图稳定版

**本版正式入口：** `斗鸡_缩域争鸣_V7.1.3_ResponseWindow稳定版.html`

本轮处理：
- RESPONSE_WINDOW 横幅不再改变地图尺寸；
- 左侧双方角色信息区固定显示持续 Buff / 状态与层数；
- 响应信息显示攻击者、牌名、第 N 连击与追击条件；
- 新增第 2 / 3 / 4 连击的反击、普通挣脱、放弃响应专项回归；
- 保留 V7.1.2 的 Observation session token / WeakMap 快照恢复修复。

**未在本轮重构：** 惊险挣脱 / EXPANSION_END 历史时序。详见 `V7.1.3_ResponseWindow_地图稳定性修复说明.md`。

---

# V7.1.1 Engine Core Phase 4 — Deterministic Core 封箱版

**正式入口：** `斗鸡_缩域争鸣_V7.1.1_Engine前端版_正式封箱.html`

正式入口加载：
- `engine.v714.core.bundle.js`
- `frontend.engine-adapter.v714.js`

`engine.v714.core.debug.bundle.js` 只供测试使用，正式页面不会加载。

Phase 3 及更早引擎、前端和 Golden Master 均保留在包内用于对照。玩法版本仍为 `7.1.1-combat-hotfix-candidate`，本阶段不做平衡和美术调整。

详见：
- `V7.1.1_EngineCore_Phase4_架构契约.md`
- `V7.1.1_EngineCore_Phase4_验证摘要.json`

---

# V7.1.1 Engine Core Phase 1（新增）

本包在不改变玩法/平衡的前提下完成第一阶段引擎化。请优先打开 `斗鸡_缩域争鸣_V7.1.1_Engine前端版.html`。
规则核心位于 `engine.v712.core.bundle.js`；架构边界与未完成项见 `V7.1.1_EngineCore_Phase1_架构契约.md`。
原单文件页面保留作为 Golden Master / 历史对照，不再作为新架构入口。

---

# V7.1.1 Combat 热修候选

本包针对四项签名行为与旧自动对局 harness 兼容问题进行修复。

已验证：
- `v6.6_signature_playability.js`：9/9 通过。
- `v7.1_combat_regression.js`：7/7 通过。
- 同一多种子 harness 的 81 局样本：81/81 完成，0 动作拒绝，0 超时，0 崩溃。

完整 810 局在当前执行环境中超过单次运行时限，因此本包标记为“热修候选”，不虚报 810/810。运行：

```bash
node v7.0_core_810_multiseed_stability.js
```

脚本现已默认加载 `engine.v702.core.bundle.js`，发生拒绝时会记录动作与合法动作列表。


## V7.1.1 规则契约修正

本交付包已按 `V7.1.1_Combat_规则契约修正说明.md` 修正：普通追击恢复 V7 全攻击响应契约，模拟器加入 scry 事务支持，并新增契约/不变量回归。


## Engine Core Phase 2

本包在 Phase 1 基础上继续收窄 UI 兼容层、扩大 ExpansionLedger 事实源，并删除 turn 的规则读取回退。详见 `V7.1.1_EngineCore_Phase2_架构契约.md`。


## Engine Core Phase 3

正式入口仍为 `斗鸡_缩域争鸣_V7.1.1_Engine前端版.html`，现加载 `engine.v713.core.bundle.js`。Phase 3 物理删除一批展开历史 mechanics 镜像，并把攻击/卡牌/治疗/移动/受伤相关规则分支统一收口到 ExpansionLedger。旧 `engine.v712.core.bundle.js` 与 Phase 2 前端对照入口继续保留。详见 `V7.1.1_EngineCore_Phase3_架构契约.md`。


## Phase 3 九角色签名回归

运行：`node v7.2_stage3_nine_role_signature_regression.js`

机器可读结果：`V7.2_Phase3_九角色签名回归_验证报告.json`

---

## V7.2 Phase 3 完整行为回归补充

本交付包已加入第三阶段完整行为回归：

- `v7.2_stage3_core_mechanics_regression.js`：确认 Skill / Ultimate / Buff / Debuff / ResponseWindow / 多段追击 / 反击 / PendingChoice；
- `v7.2_stage3_nine_role_signature_regression.js`：改为 `PASS / WARN / FAIL` 三态，legacy version 仅允许精确白名单降级 WARN；
- `V7.2_Phase3_八类核心机制闭合_验证报告.json`：本次实跑 PASS；
- `V7.2_Phase3_九角色完整行为回归_验证报告.json`：本次实跑 PASS_WITH_WARNINGS（3 个旧版本断言 WARN，0 个功能 FAIL）。

本次未修改游戏本体数值、战斗核心与 PassiveDrawSoftCap。


## V7.2.5 Phase4 缩域专项
详见 `V7.2.5_Phase4_缩域专项_改动说明.md` 与 `V7.2.5_Phase4_缩域专项_验证报告.json`。


## V7.2.6 Phase5 长局稳定性 / browserEntrySmoke
详见 `V7.2.6_Phase5_验证说明.md`。长局 12/12 PASS；真实浏览器 runtime 因当前验证环境 Chromium 策略阻断，明确保留为 PENDING，不伪报 PASS。


## V7.2.10 高手 AI Phase 1
有限预算对手感知前瞻：真实 GameState 分支、actor-aware 浅层搜索、36 节点/约 6ms 双预算；后台与低并发设备自动回退。无 Worker、无 GPU、无全局钩子、无跨决策缓存。
