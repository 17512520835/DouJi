# Tests · 测试体系说明

## 体系概览

本项目测试分两层：

| 层 | 工具 | 覆盖范围 |
|---|------|---------|
| **单元 / 集成回归** | Node.js 脚本（`v*.js`、`online_*_regression.js`） | 引擎规则、API、隐藏信息隔离、长局稳定性 |
| **构建验证** | SHA-256 清单（`V7.2.10_候选包_SHA256清单.json`） | 生产文件未被暗改 |

## 一键运行

```bash
cd tests
node run_all_regressions.js
```

会自动按版本顺序跑所有回归脚本，最后输出 `tests/reports/` 中的 JSON 报告。

## 回归脚本清单

| 版本 | 脚本 | 覆盖 |
|------|------|------|
| V6.6 | `v6.6_signature_playability.js` | 9 角色签名可玩性 |
| V7.1 | `v7.1_combat_regression.js` | 战斗回归 |
| V7.1.1 | `v7.1.1_engine_core_phase4_regression.js` | Engine Core Phase 4 封箱 |
| V7.1.3 | `v7.1.3_response_window_multihit_regression.js` | ResponseWindow 多连击 |
| V7.2 Map | `v7.2_map_fayoum_regression.js` | 法尤姆地图 |
| V7.2 Map Phase 2 | `v7.2_map_phase2_regression.js` | Map Phase 2 |
| V7.2 Map Phase 2 Hotfix | `v7.2_map_phase2_hotfix_regression.js` | Map Phase 2 Hotfix |
| V7.2 Map Phase 2 | `v7.2_map_phase2_public_api_fuzz.js` | 公共 API Fuzz |
| V7.2 MovementResolver | `v7.2_movement_resolver_regression.js` | 移动解析统一 |
| V7.2 Phase 3 核心机制 | `v7.2_stage3_core_mechanics_regression.js` | 8 类核心机制 |
| V7.2 Phase 3 九角色 | `v7.2_stage3_nine_role_signature_regression.js` | 9 角色签名 |
| V7.2.2 | `v7.2.2_movement_direction_regression.js` | 移动方向一致性 |
| V7.2.3 | `v7.2.3_hand_overflow_ui_regression.js` | 手牌过多 UI |
| V7.2.4 | `v7.2.4_passive_draw_softcap_regression.js` | 被动摸牌软上限 |
| V7.2.5 | `v7.2.5_phase4_shrink_special_regression.js` | 缩域专项 |
| V7.2.6 | `v7.2.6_browser_entry_static_smoke.js` | 浏览器入口静态扫描 |
| V7.2.6 | `v7.2.6_phase5_long_ai_stability.js` | 长局稳定性 |
| V7.2.7 | `v7.2.7_phase6_observable_golden_master.js` | 跨版本 Golden Master |
| V7.2.9 | `v7.2.9_dead_hand_regression.js` | 死手判定 |
| V7.2.10 | `v7.2.10_combat_feedback_regression.js` | 战斗通报 |
| V7.2.10 | `v7.2.10_high_ai_phase1_regression.js` | 高手 AI Phase 1 |
| V7.2.10 | `v7.2.10_high_ai_hidden_information_regression.js` | 高手 AI 隐藏信息 |
| V7.2.10 | `v7.2.10_high_ai_long_smoke.js` | 高手 AI 长局 |
| Online | `online_e2e_regression.js` | 联机端到端 |
| Online | `online_protocol_regression.js` | 联机协议 |

## 验证报告清单

22 份 JSON 报告位于 `tests/reports/`，对应每次回归运行的机器可读结果。

每份报告至少包含：
- 场景数（cases）
- PASS / FAIL / WARN 数
- command 序列与时间戳
- 失败时的合法动作列表（如有）

## 状态三态约定

所有报告中的用例状态只能是：

- **PASS**：用例通过
- **FAIL**：用例失败（代码 bug 或回归）
- **WARN**：legacy 版本允许的精确白名单降级（如 V7.2 Phase 3 九角色签名回归中的 3 个旧版本断言）
- **PENDING**：环境阻断（如 V7.2.6 Browser URL Entry Runtime 因 Chromium 策略无法执行）

**禁止**：
- ❌ 把 PENDING 标 PASS
- ❌ 把 WARN 标 PASS
- ❌ 用"反正别人跑也会遇到"掩盖 FAIL

---

**本文档版本：** V7.2.10 作品集版本