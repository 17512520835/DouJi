# 03 · WBS 工作分解结构

## 1. WBS 顶层分解

```
斗鸡 DouJi V7.2.10（1.0）
│
├── 1.1 设计审计与架构（V7.0.2 → V7.1.1）
│   ├── 1.1.1 机制盘点（8 类核心机制 × 9 角色）
│   ├── 1.1.2 Engine Core 化 Phase 1
│   ├── 1.1.3 Engine Core 化 Phase 2
│   ├── 1.1.4 Engine Core 化 Phase 3
│   └── 1.1.5 Engine Core 封箱 Phase 4（6 条停止条件）
│
├── 1.2 战斗系统修复（V7.1.3 → V7.2.4）
│   ├── 1.2.1 ResponseWindow 地图稳定性
│   ├── 1.2.2 障碍/高差可视化
│   ├── 1.2.3 移动方向一致性（MovementResolver）
│   ├── 1.2.4 手牌过多 UI 可用性
│   └── 1.2.5 被动摸牌软上限
│
├── 1.3 地图重构与验证（V7.2.5 → V7.2.7）
│   ├── 1.3.1 缩域专项（Phase 4）
│   ├── 1.3.2 长局稳定性验证（Phase 5）
│   └── 1.3.3 Golden Master 跨版本比对（Phase 6）
│
├── 1.4 美术与收尾修复（V7.2.8 → V7.2.9）
│   ├── 1.4.1 纯美术优化
│   └── 1.4.2 死手/可用牌修复
│
├── 1.5 Online 联机（V7.2.10）
│   ├── 1.5.1 联机服务器开发
│   ├── 1.5.2 客户端适配
│   ├── 1.5.3 战斗通报系统
│   ├── 1.5.4 囚徒回血数值修正
│   └── 1.5.5 打击反馈（CSS/DOM 动画）
│
└── 1.6 作品集归档（本仓库）
    ├── 1.6.1 PMBOK 项目管理文档体系（12 篇）
    ├── 1.6.2 27 篇原始迭代 MD 整理
    ├── 1.6.3 V6 完整美术素材包归档
    └── 1.6.4 GitHub Pages 部署 & README
```

## 2. 每个工作包的关键交付物

| WBS 编码 | 工作包 | 交付物 | 验收标准 | 状态 |
|---------|--------|--------|---------|------|
| 1.1.5 | Engine Core 封箱 | v714 Core Bundle | 6 条停止条件全部满足 | ✅ |
| 1.2.3 | 移动方向一致性 | v721 MovementResolver | 回归脚本全部 PASS | ✅ |
| 1.2.5 | 被动摸牌软上限 | SoftCap 逻辑 | 回归脚本 PASS | ✅ |
| 1.3.3 | Golden Master 比对 | Observable GM 报告 | 12/12 一致 | ✅ |
| 1.5.1 | 联机服务器 | online-server.js | online_e2e_regression PASS | ✅ |
| 1.5.3 | 战斗通报 | 通报 UI | V7.2.10 验证报告 PASS | ✅ |
| 1.6.1 | PMBOK 文档体系 | 12 篇 PMBOK MD | 全覆盖 5 大过程组 | ✅ |
| 1.6.3 | 美术资产归档 | 111 个文件 | 含说明与素材映射表 | ✅ |
| 1.6.4 | GitHub Pages 部署 | 可游玩链接 | 外网可访问即玩 | ✅ |

## 3. WBS 词典（关键工作包）

### 1.1.5 Engine Core 封箱
- **输入：** Phase 1–3 架构迁移成果
- **活动：** 6 条停止条件验证、Fuzz harness 编写、封箱 bug 修复
- **输出：** engine.v714.core.bundle.js（生产引擎）
- **验收：** 6 条条件全部满足 + Fuzz 0 FAIL

### 1.3.3 Golden Master 比对
- **输入：** v714（基线） + v721（当前生产）
- **活动：** 固定 Seed 跨版本执行同语义动作序列，比较 Digest
- **输出：** `V7.2.7_Phase6_ObservableGoldenMaster_验证报告.json`
- **验收：** 场景 16 · 163 command · 12 完全一致 · 0 无法解释差异

### 1.5.1 联机服务器
- **输入：** Engine Core Phase 4 封箱 API
- **活动：** Node.js HTTP + 自研 WebSocket、房间管理、Observation 下发
- **输出：** online-server.js（~200 行，0 npm 依赖）
- **验收：** online_e2e_regression.js PASS

---

**本文档版本：** V7.2.10 · WBS 工作分解结构