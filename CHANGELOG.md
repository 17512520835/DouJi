# Changelog

> 本作品集的版本变更日志。每一条都对应 `docs/iteration-archive/` 中的一篇原始说明。

## V7.2.10 · Online Phase 1 + 战斗通报与囚徒回血修正 · 2026-08

**亮点：** 作品集快照版本。包含 12 个公开版本中最完整的 PM / 架构 / 工程证据。

**新增：**
- 🎮 **Online Phase 1**：Node.js 权威服务器 + 自研 WebSocket 协议
- 📢 **战斗通报**：本地 / Online 双方攻击、追击、技能、绝技、展开推进的实时通报
- 🔧 **囚徒 013【抑制崩坏】回血修正**：每大回合恢复 2 → 1（主动收势且本展开未攻击为前提）
- ✨ **打击反馈**：CSS/DOM 视觉层（短促位移 / 柔和闪光 / 浮字）
- ♿ **可访问性**：支持 `prefers-reduced-motion`

**修复：**
- 隐藏信息隔离（对手手牌不下发）
- 回归门禁（旧 / 缺依赖下能跑全套回归）

**详见：** `docs/iteration-archive/V7.2.10_战斗通报与囚徒回血修正说明.md`、`V7.2.10_候选交付_隐藏信息与回归门禁修复说明.md`

---

## V7.2.9 · 死手与可用牌修复

**新增：** 死手判定逻辑、"放弃本回合"按钮

**详见：** `docs/iteration-archive/V7.2.9_死手与可用牌修复说明.md`

---

## V7.2.8 · 纯美术优化

**性质：** 不改游戏逻辑，只改美术。

**意义：** 验证 Phase 4 封箱后，纯美术变更不影响逻辑、不需要重跑全量回归。

---

## V7.2.7 Phase 6 · Golden Master 最终封箱

**核心：** 跨 v714 / v721 双版本比对 163 步，玩家可观察状态 100% 一致。

**新增：** Phase6 Golden Master 比较器、Observable Golden Master 验证报告、浏览器最终人工门禁工具。

**详见：** `docs/iteration-archive/V7.2.7_Phase6_最终封箱说明.md`

---

## V7.2.6 Phase 5 · 长局稳定性

**验证：** 12/12 自然结束、0 COMMAND_REJECTED、0 Event duplicate、0 Snapshot pollution、0 Replay digest mismatch

**诚实标注：** Browser URL Entry Runtime 因当前验证机 Chromium 策略阻断，**明确标 PENDING**——不伪报 PASS。

**详见：** `docs/iteration-archive/V7.2.6_Phase5_验证说明.md`

---

## V7.2.5 Phase 4 · 缩域专项

**修复：** 法尤姆缩域机制的多角色兼容问题。

**详见：** `docs/iteration-archive/V7.2.5_Phase4_缩域专项_改动说明.md`

---

## V7.2.4 · 被动摸牌软上限

**修复：** 长局下囚徒【抑制崩坏】和中央资源点的被动摸牌会把手牌顶到 12+ 张。

**决策：** 5 张设为"软目标"而非硬上限——主动摸牌仍可超过，但被动摸牌遇到 5+ 张就停。

**详见：** `docs/iteration-archive/V7.2.4_对局问题诊断与被动摸牌软上限修复说明.md`

---

## V7.2.3 · 手牌过多可用性

**修复：** 8+ 张手牌时点击查看详情失败。

**详见：** `docs/iteration-archive/V7.2.3_HandOverflow_手牌过多可用性修复说明.md`

---

## V7.2.2 · 移动方向一致性

**修复：** 玩家选了"左前方"但实际走"右前方"。

**根因：** 移动牌、技能移动、闪避反击各自有一套独立的"玩家意图 → 实际路径"解析，三套实现各自偏移。

**决策：** 统一收口到 `MovementResolver`。

**详见：** `docs/iteration-archive/V7.2.2_MovementDirection_修复说明.md`

---

## V7.2.1 · 障碍 / 高差可视化

**修复：** 地图上的高低差地形看不出来。

**详见：** `docs/iteration-archive/V7.2.1_MapVisualBarrier_障碍高差可视化说明.md`

---

## V7.1.3 · ResponseWindow 地图稳定版

**修复：** RESPONSE_WINDOW 横幅改变地图尺寸，导致响应信息丢失。

**新增：** 第 2/3/4 连击的反击 / 普通挣脱 / 放弃响应专项回归。

**详见：** `docs/iteration-archive/V7.1.3_ResponseWindow_地图稳定性修复说明.md`

---

## V7.1.1 Engine Core Phase 4 · Deterministic Core 封箱

**性质：** 架构阶段封箱。跨 4 个 Phase 完成：

- **Phase 1**：把规则核心从 HTML 抽离到独立 JS 模块
- **Phase 2**：收窄 UI 兼容层、扩大 ExpansionLedger 事实源
- **Phase 3**：物理删除展开历史 mechanics 镜像
- **Phase 4**：6 条停止条件封箱（详见 `docs/05-架构契约.md` § 3）

**关键决策：** 生产 / Debug 双 build。生产只暴露 `window.GameEngine` Facade，debug 暴露内部函数。

**修复：** Fuzz 发现的封箱 bug：拉封骑士 / 骑枪总冲在 PRE_ATTACK 直接进入 CHASE_WINDOW 但未建立 expansion。

**详见：** `docs/iteration-archive/V7.1.1_EngineCore_Phase4_架构契约.md`

---

## V7.0.2 · 设计审计与调整

**性质：** 把 V6.6 起 81 局 / 810 局 harness 验证后的项目做一次系统性盘点。

**产出：** 9 角色 × 8 类核心机制清单。

**详见：** `docs/iteration-archive/v7.0.2_设计审计与调整报告.md`

---

**完整变更记录：** 见 `docs/iteration-archive/` 下 27 篇原始说明 MD。