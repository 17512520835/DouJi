# 斗鸡 V7.2.10 Online 好友联机版

这是基于当前 `engine.v721.core.bundle.js`（Core `0.5.2-map-phase2-hotfix`）新增的 **权威服务器 Online Phase 1**。原单机入口、Core、AI 与既有回归文件均未修改。

## 已实现

- Node.js 权威服务器：服务器持有唯一真实 `GameEngineCore`。
- 两人房间：创建房间、6 位房间码、邀请链接、加入后自动开局。
- 服务器生成 seed 与先手，不信任客户端随机数。
- 客户端只收到 `getObservationForSide(side)` 与本方 `getLegalActions(side)`。
- 客户端只发送 `actionId + baseSeq`；服务器重新从当前合法动作集合中查找并执行，不能伪造卡牌、目标、side 或 PendingChoice。
- 全局 `seq` 防旧动作/双击重复提交。
- 刷新/短暂断线重连：`roomId + resumeToken` 保存在浏览器 localStorage；服务器进程仍在即可恢复。
- 投降、双方同意重赛。
- 不依赖 npm 包：`online-server.js` 自带最小 RFC6455 WebSocket 实现，Node.js 18+ 可直接运行。
- Online UI 为独立入口 `online.html`，使用通用合法动作面板，因此卡牌、技能、绝技、移动、响应窗口与 PendingChoice 都走 Core 的真实 actionId，不在客户端重写规则。

## 启动

Windows：双击 `启动联机服务器.bat`。

macOS / Linux：

```bash
chmod +x 启动联机服务器.sh
./启动联机服务器.sh
```

或直接：

```bash
node online-server.js
```

浏览器打开：

```text
http://localhost:8787
```

同一局域网的朋友使用：

```text
http://你的局域网IP:8787
```

真正跨互联网时，把这个目录部署到一台可公网访问的 Node.js 主机，并为 8787（或环境变量 `PORT` 指定端口）提供 HTTPS/WSS 反向代理。也可以用任意支持长连接 WebSocket 的 Node 容器服务。第一版没有账号与数据库，房间只存在于服务器内存，服务器重启后失效。

## 安全边界

这版特意没有采用“双方浏览器各自保存完整 GameState”的 P2P 锁步结构。完整手牌、真实牌堆顺序与私有 PendingChoice 只存在服务端 Core 中。浏览器收到的内容由 Observation API 生成；动作提交只接受服务端当前合法集合中相同的 `actionId`。

注意：这是好友联机 Phase 1，不包含账号、全球匹配、数据库持久化、观战、聊天、比赛计时器与 DDoS/滥用防护。若直接公网开放，应在反向代理层增加 TLS、连接限速、请求体限制与访问日志。

## 回归

新增：

```bash
node online_protocol_regression.js
```

它验证：

1. A/B 的 Observation 不包含对手真实手牌实例 ID；
2. 同一合法 action 通过权威校验执行后，Replay 重建 digest 一致；
3. 伪造 actionId 不会进入 Core dispatch。

原有候选门禁仍可执行：

```bash
node run_all_regressions.js
```
