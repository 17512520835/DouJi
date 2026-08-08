(function (global) {
'use strict';

// V7.0 Core — 主动权/展开账本/复合条件/双模式/统一响应/僵直/挣脱/新回合兼容层
const V7_CORE_VERSION = '7.1.1-combat-hotfix-candidate';
const ENGINE_CORE_VERSION = '0.4.0-phase4';

// ==================== engine/contract.js ====================
// ============================================================================
// V6 规则引擎公共契约 — 所有模块共享的类型与常量
// 对应设计文档：V6_设计_01_规则引擎契约
// 任何模块 import 此文件，保证状态机/状态槽/效果键全局一致
// ============================================================================

// ---- 时点状态机（设计01 §3.1）----
const PHASE = {
  IDLE: 'IDLE',
  EXPANSION_START: 'EXPANSION_START',   // 展开开始
  PRE_ATTACK: 'PRE_ATTACK',             // 攻击前行动
  CARD_DECLARED: 'CARD_DECLARED',       // 宣告卡牌
  RESPONSE_WINDOW: 'RESPONSE_WINDOW',   // 响应窗口（对手反击/挣脱）
  RESOLUTION: 'RESOLUTION',             // 结算
  CHASE_WINDOW: 'CHASE_WINDOW',         // 追击窗口
  EXPANSION_END: 'EXPANSION_END',       // 展开结束
  SUPPLY_CHOICE: 'SUPPLY_CHOICE',       // 补给点四选一（heal/energy/draw/shield）
  SECTION_TRANSITION: 'SECTION_TRANSITION', // 节推进
  GAME_OVER: 'GAME_OVER',
};

// ---- 各时点合法操作（设计01 §3.2）----
const PHASE_ACTIONS = {
  PRE_ATTACK: ['tactical', 'move', 'buff', 'resource', 'control', 'heal', 'state', 'ultimate', 'starter', 'end'],
  CARD_DECLARED: [],
  RESPONSE_WINDOW: ['counter', 'struggle'],       // 对手操作
  CHASE_WINDOW: ['follow', 'end'],                // 追击或收势（增益仅"追击中可用"）
  EXPANSION_END: ['burst_struggle'],              // 惊险挣脱
  SUPPLY_CHOICE: ['supply_heal', 'supply_energy', 'supply_draw', 'supply_shield'], // 补给四选一
};

// ---- 状态槽（设计01 §2）----
const POSTURE = { NORMAL: 'normal', AIRBORNE: 'airborne', DOWNED: 'downed' };
const CONTROL = { STIFF: 'stiff', SEALED: 'sealed', ROOTED: 'rooted' };
const PERSISTENT = { BURN: 'burn', POISON: 'poison', FROZEN: 'frozen', SHIELD: 'shield', FLYING: 'flying', MARKED: 'marked' };
const INSTANT = { KNOCKED: 'knocked', WALL_HIT: 'wall_hit', BLOCKED: 'blocked', HEALED_TICK: 'healed_tick' };

// ---- 结算管线步骤（设计01 §4.1）----
const PIPELINE = [
  'DECLARE', 'VALIDATE', 'PAY', 'RESPONSE', 'MITIGATE',
  'DAMAGE', 'APPLY_STATUS', 'MECHANIC', 'CHECK_KO', 'OPEN_CHASE',
];

// ---- 追击条件键（设计05 §2.1）----
const CONDITION = {
  NONE: '', HIT: 'hit', HURT: 'hurt', SELFHURT: 'selfhurt', MELEE: 'melee',
  ANY: 'any', WALL: 'wall', LOWHP: 'lowhp', AIR: 'air', RANGE: 'range',
  KNOCK: 'knock', DOWN: 'down', DASH: 'dash', STATUS: 'status',
  DASHSELF: 'dashself', AIRDOWN: 'airdown', FEATHER: 'feather',
  FEATHER2: 'feather2', AWAKE: 'awake', FLY: 'fly', MOVED: 'moved',
  HEALED: 'healed', QI4: 'qi4', QI3: 'qi3', SECOND: 'second', LOWDECK: 'lowdeck',
};

// ---- 效果键（设计01 §6 效果注册表，全部必须注册）----
const EFFECT = {
  NONE: '', KNOCK: 'knock', AIR: 'air', MOVE: 'move', EVADE: 'evade',
  STIFF: 'stiff', DOWN: 'down', KNOCK2: 'knock2', SEAL: 'seal',
  GUARD: 'guard', DRAW: 'draw', SELFHURT: 'selfhurt', MOVE2: 'move2',
  DRAW2: 'draw2', FEATHER: 'feather', FLY: 'fly', ZONE: 'zone',
  MOVEENERGY: 'moveenergy', QI: 'qi', CLEAN: 'clean', HEAL: 'heal',
  GUARDQI: 'guardqi', STOP: 'stop', CYCLE: 'cycle', SCRY: 'scry',
  DISCARD: 'discard', DISCOUNT: 'discount',
  // 复合/变体效果
  DRAW2_SELFHURT: 'draw2_selfhurt', // 剧痛咆哮：失1血摸2
  FLY_DRAW: 'fly_draw',             // 轻羽滑翔：进飞行摸1
  FLY_DRAW_QI: 'fly_draw_qi',       // 轻羽滑翔·改：进飞行摸1+1气（岚羽气源）
  // 角色专属增益（buff_*）
  BUFF_LUOJI_ROAR: 'buff_luoji_roar', BUFF_CHIYU_HORN: 'buff_chiyu_horn',
  BUFF_LAFENG_GLORY: 'buff_lafeng_glory', BUFF_QIU_HORMONE: 'buff_qiu_hormone',
  BUFF_BAIYE_WATER: 'buff_baiye_water', BUFF_BAIYE_WIND: 'buff_baiye_wind',
  BUFF_LANYU_CRY: 'buff_lanyu_cry', BUFF_XUANYI_DEF: 'buff_xuanyi_def',
};

// ---- 核心常量（V4.2.1 补丁 + 设计）----
const CONST = {
  BOARD: 5,
  START_HAND: 5,
  HAND_LIMIT: 5,
  ENERGY_MAX: 5,
  QI_MAX: 5,
  MAX_ATTACKS: 8,       // V7 Core：展开软上限8次攻击
  MAX_FOLLOW: 7,        // V7 Core：最多7次追击
  DECAY_4TH: 1,         // 第4击衰减
  DECAY_5TH: 2,         // 第5击衰减
  SECTIONS: 4,
  EXPANSIONS_PER_SECTION: 4,
  MELEE_RANGE: 1,
  RANGED_RANGE: 3,
  DASH_DIST: 2,
  // V6 气经济（设计03 §2）—— R2 重构：平滑产气
  // 旧模型"第3击/第5击才产气"对短连击角色是结构性窒息（链长<3每展开产气≈0），
  // 实测气产/展开与胜率强相关（洛基0.27→76%胜，游影0.04→绝技0%）。
  // 新模型：每次攻击命中+1气（基础），连击第3击额外+1（加成），受大伤+1（补偿）。
  QI_ON_HIT: 1,         // 每次攻击命中产气（基础，鼓励进攻）
  QI_ON_3RD_HIT: 1,     // 连击第3击额外产气（连击加成）
  QI_ON_5TH_HIT: 1,     // 连击第5击再额外产气（连击加成）
  QI_ON_BIG_HIT: 1,     // 单次受≥3伤产气（受伤补偿）
  BIG_HIT_THRESHOLD: 3,
  QI_PER_ROUND_CAP: 5,  // 每大回合战斗产气上限（平滑后产量上升，3→5）[PLACEHOLDER]
  // V6 能量游码（设计03 §3）
  ENERGY_DRAIN_FLOOR: 1,  // 能量抽取下限保护
  ENERGY_DRAIN_CAP: 1,    // 每展开抽取上限
};

// ---- 状态对象工厂 ----
function makeStatus(id, source, opts = {}) {
  return { id, source, stacks: opts.stacks || 1, remainingTriggers: opts.triggers ?? null, meta: opts.meta || {} };
}

// ---- 结算记录工厂（设计01 §4.2 连击透明的核心）----
function makeResolutionLog(cardName, step) {
  return {
    cardName, cardType: '', step, baseDamage: 0, bonuses: [], decay: 0, finalDamage: 0,
    healing: 0, statusApplied: [], chaseConditionMet: '', counteredBy: null, note: '',
  };
}


// ==================== engine/state.js ====================
// ============================================================================
// V6 引擎 — 游戏状态与状态分槽机
// 对应设计01 §2（状态分槽机）
// 四槽：posture(互斥) / control[] / persistent[] / instant[]
// ============================================================================


// ---------------------------------------------------------------------------
// GameState 工厂
// ---------------------------------------------------------------------------

/**
 * 创建一方玩家的状态切片。
 * @param {object} hero 角色数据（来自 heroes.js）
 * @param {Array} deck 已洗好的牌堆（牌对象数组）
 * @returns {object} PlayerState
 */
function makePlayerState(hero, deck) {
  return {
    hero,                       // 角色数据（只读引用）
    hp: hero.hp,
    energy: CONST.ENERGY_MAX,
    qi: 0,
    hand: [],
    deck,
    discard: [],
    statusSlots: makeStatusSlots(),
    ultimatesUsed: [],          // 已使用的绝技 id
    // 机制计数 / 标志（每展开/每大回合/每节重置）
    mechanics: {
      firstBloodThisRound: false,     // 本大回合首次失血（洛基 hardy）
      firstHurtThisRound: false,      // 本大回合首次受伤（洛基 adversity_heart）
      firstCounterThisRound: false,   // 本大回合首次反击（拉封 duel_counter）
      royalOrderUsedThisRound: false, // 王室军令已用
      followResponseUsedThisEnemyExpansion: false, // 拉封：本次敌方展开已响应过追击
      knockAdvanceUsed: false,        // 赤羽战舞推进本展开已用
      secondAttackBuffed: false,      // 赤羽战意叠加已触发
      fourthAttackDrawn: false,       // 洛基连打节奏已触发
      championRoundLeft: 0,           // 冠军回合剩余加成次数
      cornerStorm: false,             // 角落风暴本展开生效
      sunDance: false,                // 烈日战舞本展开生效
      bloodTotem: false,              // 血祭图腾本展开生效
      ancestralHuntOn: null,          // 先民围猎目标 side
      duelOath: false,                // 决斗宣誓本展开生效
      gloryCall: false,               // 荣耀宣令本展开生效
      curtainCall: false,             // 谢幕之礼本展开生效
      luojiRoarArmed: false,          // 冠军怒吼已挂（待失血触发）
      luojiRoarBuff: 0,               // 冠军怒吼下一击加成
      chiyuHornArmed: false,          // 先民号角
      lafengGloryArmed: false,        // 荣耀宣令 buff
      energyDrainThisExpansion: 0,    // 本展开能量抽取次数（游码上限）
      qiThisRound: 0,                 // 本大回合战斗产气（封顶）
      tacticalStepUsed: false,
      struggleUsesThisSection: 0,
      riskyStruggleUsedThisExpansion: false,        // 本展开免费战术步已用
      handRedrawUsedThisRound: false, // 本大回合整备换手已用
      fullOverload: false,            // 囚徒技能：第2/3击+1，收势自损1
      qiuHormoneArmed: false,         // 囚徒技能：下一张攻击+2，结算后自损1
      qiuOverloadTriggeredThisExpansion: false, // 囚徒常驻：本展开第3张攻击过载已结算
      qiuFirstSelfDamageThisRound: false, // 囚徒常驻：本大回合首次自损摸牌已结算
      qiuSuppressBreakUsedThisRound: false, // 囚徒常驻：本大回合抑制崩坏已结算（每大回合限1次）
      lanyuFreeFlyUsedThisRound: false, // 岚羽常驻：本大回合首次进飞行免费额度已用
      fate: 0,                          // 法尤姆：命运资源
      drawProgress: 0,                  // 法尤姆：命运编织的摸牌进度（每3张+1命运）
      feathers: hero.id === 'baiye' ? 1 : 0,
      awakened: false,
      chickGuard: false,              // 白夜：下一次敌方伤害-2并得1羽
      lakeDance: false,               // 白夜：本展开移动为下一击蓄+1
      lakeDanceCharges: 0,
      baiyeWaterMoveArmed: false,      // 白夜：下一次主动移动距离+1
      baiyeWaterDamageArmed: false,    // 白夜：水面借力移动后下一击+1
      baiyeWindArmed: false,           // 白夜：下一张满足条件的追击再-1费
      flowBreak: false,               // 游影：游步距离2，首次游步换1牌
      flowBreakCycled: false,
      swiftDouble: false,             // 游影：下一次追击忽略条件
      wanderMovesUsed: 0,
      momentumArmed: false,           // 游影：移动后下一击+1
      momentumUsedThisExpansion: 0,   // 游影：本展开借势已触发次数（最多2次，对齐游步）
      shadowlessMoveUsed: false,      // 游影：本展开首张移动牌0费
      greatCycle: false,              // 玄医：收势回2并得1气
      xuanyiDefArmed: false,          // 玄医：下一张反击-1费且+1伤（跨到对手展开）
      activeHealUsedThisExpansion: false, // 玄医：主动恢复牌/回春每展开合计至多1次
      rejuvenateLastRound: 0,       // 玄医：回春最近使用的大回合
      // 地形机制标志
      highlandFirstHitUsed: false,  // 高地：本展开首击+1已结算
      bushFirstHitUsed: false,      // 草丛：本展开首击不可反击已暴露
      resourceStreak: 0,            // 资源点连续占据大回合数（离开资源点清零）
      followStepAvailable: 0,
      luojiSecondRefundUsed: false,
      painRoarUsed: false,
      painExcited: false,
      lafengRiposteArmed: false,
      lafengRiposteReady: false,
      lafengSeize: false,
      lafengSeizeFollow: false,
      xuanyiHiddenNeedleArmed: false,
      xuanyiHiddenNeedleReady: false,
      fateLineFrom: null,
    },
  };
}

/**
 * 创建空状态分槽。
 * @returns {{posture:?object, control:Array, persistent:Array, instant:Array}}
 */
function makeStatusSlots() {
  return {
    posture: null,      // { id, source, ... } 互斥；null 视为 normal
    control: [],        // ControlStatus[]
    persistent: [],     // PersistentStatus[]
    instant: [],        // InstantEvent[] 带 seq
  };
}

/**
 * 创建整局游戏状态。
 * @param {object} heroA 先手方角色
 * @param {object} heroB 后手方角色
 * @param {object} options { first: 0|1, seed }
 * @returns {object} GameState
 */
function makeGameState(heroA, heroB, options = {}) {
  // options.board：外部注入的棋盘（含地形）。缺省走 makeBoard()（terrain:null 占位）。
  // 引擎层不依赖数据层：地形棋盘由 index.js 从 maps.js 转换后注入，保持依赖方向干净。
  const board = options.board || makeBoard();
  const state = {
    phase: PHASE.IDLE,
    turn: options.first ?? 0,           // 只读兼容镜像；核心规则不得据此裁定
    roundFirstPlayer: options.first ?? 0, // 当前大回合起始方（正式语义名）
    roundOwner: options.first ?? 0,      // 兼容别名：等同 roundFirstPlayer
    mainActionSide: options.first ?? 0,  // 当前主行动段操作者
    mainTurnOwner: options.first ?? 0,   // 旧字段兼容镜像 mainActionSide
    initiativeSide: options.first ?? 0, // 兼容镜像 expansion.initiativeSide
    responseWindow: null,
    pendingChoice: null,
    idCounters: { event:0, mainAction:1, chain:0, response:0, choice:0 },
    mainActionIndexInRound: 0,
    completedMainTurnsInRound: 0,
    expansion: null,
    players: [null, null],
    board,
    expansionCount: 0,                  // 已完成的展开总数（从 0 起，首个展开为 1）
    section: 1,                         // 当前节（1..4）
    round: 1,                           // 大回合（2 展开 = 1 大回合）
    chain: [],                          // 当前连击链 ResolutionLog[]
    log: [],                            // 全局日志
    instantSeq: 0,                      // 即时事件序列号（全局单调递增）
    pendingCard: null,                  // RESPONSE_WINDOW 期间挂起的牌
    winner: null,                       // 0|1|null
    supplyIndex: 0,                     // 补给点轮换索引
    // 可序列化 PRNG 状态。不能把函数放进 GameState，否则 structuredClone 事务拷贝失败。
    // 每次随机操作推进该整数；事务回滚时随机序列也随 state 一起回滚。
    rngState: (options.seed ?? 1) >>> 0,
  };
  state.players[0] = makePlayerState(heroA, options.deckA || []);
  state.players[1] = makePlayerState(heroB, options.deckB || []);
  // 起点：A(5,3) B(1,3) —— 1-based 设计坐标，内部存 0-based
  state.players[0].pos = { r: 4, c: 2 };
  state.players[1].pos = { r: 0, c: 2 };
  return state;
}

/**
 * 创建 5×5 棋盘。障碍 (2,2)(2,4)(4,2)(4,4)，中央资源点 (3,3)。
 * 坐标 1-based 设计 → 0-based 内部。
 * @returns {object} board
 */
function makeBoard() {
  const N = CONST.BOARD;
  const cells = [];
  for (let r = 0; r < N; r++) {
    const row = [];
    // terrain: 单格地形（highland/bush/mud），默认 null。
    // 守卫语义：所有地形效果仅在 cell.terrain 为真值时触发，
    // 因此默认棋盘（terrain:null）下 65 个引擎测试零影响。
    for (let c = 0; c < N; c++) row.push({ obstacle: false, zone: true, terrain: null });
    cells.push(row);
  }
  const obstacles = [[1, 1], [1, 3], [3, 1], [3, 3]]; // (2,2)(2,4)(4,2)(4,4)
  for (const [r, c] of obstacles) cells[r][c].obstacle = true;
  return {
    size: N,
    cells,
    resource: { r: 2, c: 2 },                       // 中央资源点 (3,3)
    supplyRotation: [                               // 补给点轮换
      { r: 1, c: 2 }, { r: 2, c: 3 }, { r: 3, c: 2 }, { r: 2, c: 1 },
    ],
    // TODO(team-lead): 地形（高地/草丛/泥地）接口预留
    terrain: null,
  };
}

// ---------------------------------------------------------------------------
// 状态分槽机操作
// ---------------------------------------------------------------------------

/**
 * 获取姿态 id（null 视为 normal）。
 * @param {object} player
 * @returns {string} POSTURE 值
 */
function getPosture(player) {
  return player.statusSlots.posture?.id || POSTURE.NORMAL;
}

/**
 * 设置姿态（互斥，新值覆盖旧值）。
 * 边界：飞行中受倒地 → 先结束飞行再置倒地（设计01 §2.2）。
 * @param {object} state GameState
 * @param {number} side 0|1
 * @param {string} postureId POSTURE 值
 * @param {string} source 来源牌名/机制名
 */
function setPosture(state, side, postureId, source) {
  const p = state.players[side];
  if (postureId === POSTURE.DOWNED) {
    // 倒地先结束飞行
    removeStatus(state, side, PERSISTENT.FLYING);
  }
  if (postureId === POSTURE.NORMAL) {
    p.statusSlots.posture = null;
  } else {
    p.statusSlots.posture = makeStatus(postureId, source);
  }
}

/**
 * 添加状态到对应槽位。姿态走 setPosture；其余按 id 判断槽位。
 * @param {object} state
 * @param {number} side
 * @param {string} statusId CONTROL/PERSISTENT/INSTANT 之一
 * @param {string} source
 * @param {object} [opts] { stacks, triggers, meta }
 * @returns {object} 新加入的 status 对象
 */
function addStatus(state, side, statusId, source, opts = {}) {
  const p = state.players[side];
  const st = makeStatus(statusId, source, opts);
  if (Object.values(CONTROL).includes(statusId)) {
    p.statusSlots.control.push(st);
  } else if (Object.values(PERSISTENT).includes(statusId)) {
    // 同 id 持续状态叠层
    const exist = p.statusSlots.persistent.find((s) => s.id === statusId);
    if (exist) {
      exist.stacks += st.stacks;
      if (st.remainingTriggers != null) {
        exist.remainingTriggers = Math.max(exist.remainingTriggers ?? 0, st.remainingTriggers);
      }
      return exist;
    }
    p.statusSlots.persistent.push(st);
  } else if (Object.values(INSTANT).includes(statusId)) {
    st.seq = ++state.instantSeq;
    p.statusSlots.instant.push(st);
  } else {
    throw new Error(`addStatus: 未知状态 id "${statusId}"（来源 ${source}）`);
  }
  return st;
}

/**
 * 移除指定 id 的状态（姿态/控制/持续/即时均可）。
 * @param {object} state
 * @param {number} side
 * @param {string} statusId
 * @returns {boolean} 是否移除了至少一个
 */
function removeStatus(state, side, statusId) {
  const p = state.players[side];
  let removed = false;
  if (p.statusSlots.posture?.id === statusId) {
    p.statusSlots.posture = null;
    removed = true;
  }
  for (const slot of ['control', 'persistent', 'instant']) {
    const arr = p.statusSlots[slot];
    const n = arr.length;
    p.statusSlots[slot] = arr.filter((s) => s.id !== statusId);
    if (p.statusSlots[slot].length !== n) removed = true;
  }
  return removed;
}

/**
 * 查询是否持有某状态。
 * @param {object} player PlayerState
 * @param {string} statusId
 * @returns {boolean}
 */
function hasStatus(player, statusId) {
  const s = player.statusSlots;
  if (s.posture?.id === statusId) return true;
  return s.control.some((x) => x.id === statusId)
      || s.persistent.some((x) => x.id === statusId)
      || s.instant.some((x) => x.id === statusId);
}

/**
 * 取出指定 id 的持续状态对象（用于读 stacks / remainingTriggers）。
 * @param {object} player
 * @param {string} statusId
 * @returns {?object}
 */
function getStatus(player, statusId) {
  const s = player.statusSlots;
  if (s.posture?.id === statusId) return s.posture;
  return s.control.find((x) => x.id === statusId)
      || s.persistent.find((x) => x.id === statusId)
      || s.instant.find((x) => x.id === statusId)
      || null;
}

/**
 * 消费一个即时事件（读取后移除）。
 * @param {object} state
 * @param {number} side
 * @param {string} statusId INSTANT 值
 * @returns {?object} 被消费的事件；不存在则 null
 */
function consumeInstant(state, side, statusId) {
  const p = state.players[side];
  const idx = p.statusSlots.instant.findIndex((s) => s.id === statusId);
  if (idx < 0) return null;
  const [ev] = p.statusSlots.instant.splice(idx, 1);
  return ev;
}

/**
 * 读取最近的即时事件（不消费）。用于"knocked 只能被紧随其后那张追击牌读取"。
 * @param {object} player
 * @param {string} statusId
 * @returns {?object}
 */
function peekInstant(player, statusId) {
  const arr = player.statusSlots.instant.filter((s) => s.id === statusId);
  return arr.length ? arr[arr.length - 1] : null;
}

/**
 * 按结算阶段清理状态。
 * @param {object} state
 * @param {number} side
 * @param {string} phase PHASE 值（EXPANSION_START / EXPANSION_END）
 */
function clearExpired(state, side, phase) {
  const p = state.players[side];
  if (phase === PHASE.EXPANSION_END) {
    // 姿态复位（浮空/倒地 → 正常；倒地结束飞行已在 setPosture 处理）
    p.statusSlots.posture = null;
    // 控制槽全部清除（僵直/封锁/禁步时效均为当前展开结束）
    p.statusSlots.control = [];
    // 飞行到自己展开结束
    p.statusSlots.persistent = p.statusSlots.persistent.filter(
      (s) => s.id !== PERSISTENT.FLYING,
    );
    // 未消费的即时事件全部失效
    p.statusSlots.instant = [];
  }
  // EXPANSION_START 的清理由引擎按机制（如中毒扣血）处理，此处不通用清理
}

// ---------------------------------------------------------------------------
// 深拷贝（事务回滚 / 模拟）
// ---------------------------------------------------------------------------

/**
 * 深拷贝 GameState。hero 数据为只读引用不拷贝。
 * @param {object} state
 * @returns {object} 新状态
 */
function clone(state) {
  return structuredClone(state);
}


// ==================== engine/effects.js ====================
// ============================================================================
// V6 引擎 — 效果注册表
// 对应设计01 §6：每个效果键必须注册一个纯函数处理器，未注册启动期抛错
// ctx: { state, attacker, defender, card, log, engine }
//   attacker/defender 为 side 索引（0|1）
//   log 为当前 ResolutionLog
//   engine 为引擎内部辅助（位移/伤害/抽牌等），由 engine.js 注入
// ============================================================================



// ---------------------------------------------------------------------------
// 通用效果 handlers
// ---------------------------------------------------------------------------

/** knock：击退1格，撞墙+1伤。 */
function fxKnock(ctx) {
  ctx.engine.knockback(ctx, 1);
}

/** knock2：击退2格。 */
function fxKnock2(ctx) {
  ctx.engine.knockback(ctx, 2);
}

/** air：浮空。 */
function fxAir(ctx) {
  setPosture(ctx.state, ctx.defender, POSTURE.AIRBORNE, ctx.card.name);
  ctx.log.statusApplied.push(POSTURE.AIRBORNE);
}

/** down：倒地（结束飞行）。 */
function fxDown(ctx) {
  setPosture(ctx.state, ctx.defender, POSTURE.DOWNED, ctx.card.name);
  ctx.log.statusApplied.push(POSTURE.DOWNED);
}

/** stiff：僵直（下一次攻击牌费用+1）。 */
function fxStiff(ctx) {
  addStatus(ctx.state, ctx.defender, CONTROL.STIFF, ctx.card.name);
  ctx.log.statusApplied.push(CONTROL.STIFF);
}

/** seal：封锁（下一张反击不可用）。 */
function fxSeal(ctx) {
  addStatus(ctx.state, ctx.defender, CONTROL.SEALED, ctx.card.name);
  ctx.log.statusApplied.push(CONTROL.SEALED);
}

/** move：攻击方移动1格（向目标逼近或自定义方向，由 engine 决定）。 */
function fxMove(ctx) {
  ctx.engine.moveSelectedOrToward(ctx, 1);
}

/** move2：移动2格；玩家可选任意合法路径，包括后退。 */
function fxMove2(ctx) {
  ctx.engine.moveSelectedOrToward(ctx, 2);
}

/** evade：闪避后真正远离攻击者，而不是继续贴近。 */
function fxEvade(ctx) {
  ctx.log.bonuses.push({ source: 'evade', amount: -ctx.log.finalDamage });
  ctx.log.finalDamage = 0;
  ctx.log.note += '闪避后退;';
  ctx.engine.moveAway(ctx, 1, { optional: true });
}

/** guard：格挡（本伤害-1，获得 shield）。 */
function fxGuard(ctx) {
  addStatus(ctx.state, ctx.attacker, PERSISTENT.SHIELD, ctx.card.name, { triggers: 1 });
  ctx.log.statusApplied.push(PERSISTENT.SHIELD);
}

/** draw：抽1。 */
function fxDraw(ctx) {
  ctx.engine.drawCards(ctx.state, ctx.attacker, 1);
}

/** draw2：抽2。 */
function fxDraw2(ctx) {
  ctx.engine.drawCards(ctx.state, ctx.attacker, 2);
}

/** selfhurt：自伤1。 */
function fxSelfhurt(ctx) {
  ctx.engine.damage(ctx.state, ctx.attacker, 1, ctx.card.name, { isSelf: true });
  ctx.log.note += '自伤1;';
}

/** feather：白夜获得1进化羽；其他角色保留通用 marked 资源标记。 */
function fxFeather(ctx) {
  const p = ctx.state.players[ctx.attacker];
  if(p.hero.id==='baiye'){if(ctx.card.requiresAttackForFeather&&v7LedgerValue(ctx.state,ctx.attacker,'attacksResolved')<1){ctx.log.note+='未参与攻击，不获得进化羽;';return}ctx.engine.gainBaiyeFeather(ctx.state,ctx.attacker,1);ctx.log.statusApplied.push('feather');return}
  addStatus(ctx.state, ctx.attacker, PERSISTENT.MARKED, ctx.card.name, {
    meta: { kind: 'feather' },
  });
  ctx.log.statusApplied.push('marked');
}

/** fly：飞行（持续到本展开结束）。经公共 enterFlying，统一结算岚羽永翔之魂。 */
function fxFly(ctx) {
  ctx.engine.enterFlying(ctx.state, ctx.attacker, ctx.card.name);
  ctx.log.statusApplied.push(PERSISTENT.FLYING);
}

/** zone：封锁目标格（简化：对目标施加 rooted）。 */
function fxZone(ctx) {
  addStatus(ctx.state, ctx.defender, CONTROL.ROOTED, ctx.card.name);
  ctx.log.statusApplied.push(CONTROL.ROOTED);
}

/** moveenergy：能量游码（从对手抽1能，受游码下限/上限保护）。 */
function fxMoveenergy(ctx) {
  ctx.engine.drainEnergy(ctx, 1);
}

/** qi：得1气。 */
function fxQi(ctx) {
  ctx.engine.gainQi(ctx.state, ctx.attacker, 1, { combat: false });
}

/** clean：净化（移除自身全部控制+持续伤害类）。 */
function fxClean(ctx) {
  const p = ctx.state.players[ctx.attacker];
  p.statusSlots.control = [];
  p.statusSlots.persistent = p.statusSlots.persistent.filter(
    (s) => ![PERSISTENT.BURN, PERSISTENT.POISON, PERSISTENT.FROZEN].includes(s.id),
  );
  ctx.log.note += '净化;';
}

/** heal：回2。 */
function fxHeal(ctx) {
  ctx.engine.heal(ctx.state, ctx.attacker, 2);
}

/** guardqi：格挡并得1气。 */
function fxGuardqi(ctx) {
  fxGuard(ctx);
  ctx.engine.gainQi(ctx.state, ctx.attacker, 1, { combat: false });
}

/** stop：终止连击链（清空对手追击窗口）。 */
function fxStop(ctx) {
  ctx.state.chainTerminated = true;
  ctx.log.note += '终止连击;';
}

/** cycle：循环（弃1抽1）。 */
function fxCycle(ctx) {
  ctx.engine.cycleCard(ctx.state, ctx.attacker, 1);
}

/** scry：观星（看牌堆顶2，可重排——简化直接记录）。 */
function fxScry(ctx) {
  ctx.engine.scry(ctx.state, ctx.attacker, 2);
}

/** discard：弃对手1张手牌（随机）。 */
function fxDiscard(ctx) {
  ctx.engine.discardRandom(ctx.state, ctx.defender, 1);
}

/** discount：本展开下一张牌费用-1。 */
function fxDiscount(ctx) {
  const p = ctx.state.players[ctx.attacker];
  p.mechanics.discountNext = (p.mechanics.discountNext || 0) + 1;
  ctx.log.note += '降费;';
}

// ---------------------------------------------------------------------------
// 角色专属 buff
// ---------------------------------------------------------------------------

/** 洛基·冠军怒吼：失1血，本展开下一次攻击+1伤。 */
function fxBuffLuojiRoar(ctx) {
  ctx.engine.damage(ctx.state, ctx.attacker, 1, ctx.card.name, { isSelf: true });
  const p = ctx.state.players[ctx.attacker];
  p.mechanics.luojiRoarBuff = 1;
  ctx.log.note += '冠军怒吼挂起;';
}

/** 赤羽·先民号角：本展开击退+1格。 */
function fxBuffChiyuHorn(ctx) {
  const p = ctx.state.players[ctx.attacker];
  p.mechanics.chiyuHornArmed = true;
  ctx.log.note += '先民号角挂起;';
}

/** 拉封·荣耀宣令：本展开下一张反击费用-1且反击伤害+1。 */
function fxBuffLafengGlory(ctx){const p=ctx.state.players[ctx.attacker];p.mechanics.lafengRiposteArmed=true;ctx.log.note+='荣耀回刺：等待成功反击;'}

/** 剧痛咆哮（draw2_selfhurt）：失1血，摸2。 */
function fxDraw2Selfhurt(ctx){const p=ctx.state.players[ctx.attacker];ctx.engine.damage(ctx.state,ctx.attacker,1,ctx.card.name,{isSelf:true});ctx.engine.drawCards(ctx.state,ctx.attacker,2);p.mechanics.painRoarUsed=true;p.mechanics.painExcited=true;ctx.log.note+='剧痛咆哮：自伤1、摸2、痛觉兴奋;'}

/** 轻羽滑翔（fly_draw）：进飞行，摸1。 */
function fxFlyDraw(ctx) {
  ctx.engine.enterFlying(ctx.state, ctx.attacker, ctx.card.name);
  ctx.log.statusApplied.push(PERSISTENT.FLYING);
  ctx.engine.drawCards(ctx.state, ctx.attacker, 1);
  ctx.log.note += '轻羽滑翔:进飞行摸1;';
}

/** 轻羽滑翔·改（fly_draw_qi）：进飞行，摸1，+1气（岚羽独有气源）。 */
function fxFlyDrawQi(ctx) {
  ctx.engine.enterFlying(ctx.state, ctx.attacker, ctx.card.name);
  ctx.log.statusApplied.push(PERSISTENT.FLYING);
  ctx.engine.drawCards(ctx.state, ctx.attacker, 1);
  ctx.engine.gainQi(ctx.state, ctx.attacker, 1, { combat: false });
  ctx.log.note += '轻羽滑翔:进飞行摸1+1气;';
}

/** 囚徒013·荷尔蒙潮汐：本展开下一张自损牌伤害+2，自损最多1。 */
function fxBuffQiuHormone(ctx) {
  const p = ctx.state.players[ctx.attacker];
  p.mechanics.qiuHormoneArmed = true;
  ctx.log.note += '荷尔蒙潮汐挂起;';
}

/** 白夜·水面借力：本展开下一次移动距离+1，完成该次移动后下一击+1伤。 */
function fxBuffBaiyeWater(ctx) {
  const p = ctx.state.players[ctx.attacker];
  p.mechanics.baiyeWaterMoveArmed = true;
  ctx.log.note += '水面借力挂起;';
}

/** 白夜·逆风展翼：本展开下一张满足追击条件的攻击费用再-1；若已觉醒摸1。 */
function fxBuffBaiyeWind(ctx) {
  const p = ctx.state.players[ctx.attacker];
  p.mechanics.baiyeWindArmed = true;
  if (p.mechanics.awakened) ctx.engine.drawCards(ctx.state, ctx.attacker, 1);
  ctx.log.note += '逆风展翼挂起;';
}

/** 岚羽·天际鸣啸：进入飞行，本展开下一张飞行攻击+1伤。 */
function fxBuffLanyuCry(ctx){const p=ctx.state.players[ctx.attacker];p.mechanics.lanyuCryArmed=true;ctx.log.note+='天际鸣啸：飞行追击减费并增程;'}

/** 玄医·以守为攻：本展开下一张反击牌费用-1且伤害+1。 */
function fxBuffXuanyiDef(ctx){const p=ctx.state.players[ctx.attacker];p.mechanics.xuanyiHiddenNeedleArmed=true;ctx.log.note+='守中藏针：等待成功反击;'}

// ---------------------------------------------------------------------------
// 注册表
// ---------------------------------------------------------------------------

const EFFECT_REGISTRY = {
  [EFFECT.NONE]: () => {},
  [EFFECT.KNOCK]: fxKnock,
  [EFFECT.KNOCK2]: fxKnock2,
  [EFFECT.AIR]: fxAir,
  [EFFECT.DOWN]: fxDown,
  [EFFECT.STIFF]: fxStiff,
  [EFFECT.SEAL]: fxSeal,
  [EFFECT.MOVE]: fxMove,
  [EFFECT.MOVE2]: fxMove2,
  [EFFECT.EVADE]: fxEvade,
  [EFFECT.GUARD]: fxGuard,
  [EFFECT.DRAW]: fxDraw,
  [EFFECT.DRAW2]: fxDraw2,
  [EFFECT.SELFHURT]: fxSelfhurt,
  [EFFECT.FEATHER]: fxFeather,
  [EFFECT.FLY]: fxFly,
  [EFFECT.ZONE]: fxZone,
  [EFFECT.MOVEENERGY]: fxMoveenergy,
  [EFFECT.QI]: fxQi,
  [EFFECT.CLEAN]: fxClean,
  [EFFECT.HEAL]: fxHeal,
  [EFFECT.GUARDQI]: fxGuardqi,
  [EFFECT.STOP]: fxStop,
  [EFFECT.CYCLE]: fxCycle,
  [EFFECT.SCRY]: fxScry,
  [EFFECT.DISCARD]: fxDiscard,
  [EFFECT.DISCOUNT]: fxDiscount,
  [EFFECT.BUFF_LUOJI_ROAR]: fxBuffLuojiRoar,
  [EFFECT.BUFF_CHIYU_HORN]: fxBuffChiyuHorn,
  [EFFECT.BUFF_LAFENG_GLORY]: fxBuffLafengGlory,
  [EFFECT.DRAW2_SELFHURT]: fxDraw2Selfhurt,
  [EFFECT.FLY_DRAW]: fxFlyDraw,
  [EFFECT.FLY_DRAW_QI]: fxFlyDrawQi,
  [EFFECT.BUFF_QIU_HORMONE]: fxBuffQiuHormone,
  [EFFECT.BUFF_BAIYE_WATER]: fxBuffBaiyeWater,
  [EFFECT.BUFF_BAIYE_WIND]: fxBuffBaiyeWind,
  [EFFECT.BUFF_LANYU_CRY]: fxBuffLanyuCry,
  [EFFECT.BUFF_XUANYI_DEF]: fxBuffXuanyiDef,
};

/**
 * 启动自检：遍历所有卡牌 effect 键，凡不在注册表就抛错指出牌名。
 * @param {object} allHeroes HEROES 字典（heroes.js）
 * @throws {Error} 第一张未注册效果的牌
 */
function validateRegistry(allHeroes) {
  const missing = [];
  for (const hero of Object.values(allHeroes)) {
    for (const card of hero.cards || []) {
      const key = card.effect || EFFECT.NONE;
      if (!(key in EFFECT_REGISTRY)) {
        missing.push(`${hero.name}/${card.name} (effect="${key}")`);
      }
    }
  }
  if (missing.length) {
    throw new Error(`效果注册表缺失：\n  ${missing.join('\n  ')}`);
  }
}


// ==================== engine/engine.js ====================
// ============================================================================
// V6 引擎 — 规则引擎核心
// 对应设计01 §3（时点状态机）、§4（结算管线）、§5（整备管线）
// 事务安全：每个公开操作先在 clone 上结算，校验通过才提交；异常回滚
// ============================================================================




// ---------------------------------------------------------------------------
// 内部辅助（注入到效果 ctx.engine）
// ---------------------------------------------------------------------------

const HEX_MAP_DATA = {"id":"terraced_arena_9x9","name":"层台争鸣场","version":"playable-hex-1","grid":"hex_axial_pointy","size":{"nominalColumns":9,"nominalRows":9,"effectiveCells":61,"radius":4},"balanceStatus":"功能迁移验收；尚未开始角色平衡调整。","spawns":{"A":"E1","B":"E9"},"resourcePoints":["E5"],"supplyPoints":["B5","H5"],"ramps":[{"a":"E2","b":"E3"},{"a":"D3","b":"D4"},{"a":"F3","b":"F4"},{"a":"D8","b":"E7"},{"a":"F7","b":"E6"},{"a":"D7","b":"C6"}],"shrinkStages":[{"section":1,"danger":[],"locked":[]},{"section":2,"danger":["A5","A6","B7","B8","C9","A4","D9","B3","E9","B2","F9","C1","G9","D1","G8","E1","H7","F1","H6","G1","G2","H3","H4","I5"],"locked":[]},{"section":3,"danger":["B5","B6","C7","C8","B4","D8","C3","E8","C2","F8","D2","G7","E2","G6","F2","G3","G4","H5"],"locked":["A5","A6","B7","B8","C9","A4","D9","B3","E9","B2","F9","C1","G9","D1","G8","E1","H7","F1","H6","G1","G2","H3","H4","I5"]},{"section":4,"danger":["C5","C6","D7","C4","E7","D3","F7","E3","F6","F3","F4","G5"],"locked":["A5","A6","B7","B8","C9","A4","B5","B6","C7","C8","D9","B3","B4","D8","E9","B2","C3","E8","F9","C1","C2","F8","G9","D1","D2","G7","G8","E1","E2","G6","H7","F1","F2","G3","G4","H5","H6","G1","G2","H3","H4","I5"]},{"section":5,"danger":["D5","D6","D4","E6","E4","F5"],"locked":["A5","A6","B7","B8","C9","A4","B5","B6","C7","C8","D9","B3","B4","C5","C6","D7","D8","E9","B2","C3","C4","E7","E8","F9","C1","C2","D3","F7","F8","G9","D1","D2","E3","F6","G7","G8","E1","E2","F3","F4","G5","G6","H7","F1","F2","G3","G4","H5","H6","G1","G2","H3","H4","I5"]}],"cells":{"A5":{"q":-4,"r":0,"col":0,"row":4,"terrain":"grass","height":0,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":4,"neighbors":[{"to":"B5","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"A4","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"A6","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"e":{"to":"B5","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"ne":{"to":"A4","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"se":{"to":"A6","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}}},"A6":{"q":-4,"r":1,"col":0,"row":5,"terrain":"bush","height":0,"walkable":true,"obstacle":false,"blocksLOS":true,"ring":4,"neighbors":[{"to":"B6","dir":"e","passable":true,"cost":2,"tags":["difficult","end_move"],"ramp":false,"cliff":false},{"to":"B5","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"A5","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"B7","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"e":{"to":"B6","dir":"e","passable":true,"cost":2,"tags":["difficult","end_move"],"ramp":false,"cliff":false},"ne":{"to":"B5","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"nw":{"to":"A5","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"se":{"to":"B7","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}}},"B7":{"q":-4,"r":2,"col":1,"row":6,"terrain":"grass","height":0,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":4,"neighbors":[{"to":"C7","dir":"e","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"B6","dir":"ne","passable":true,"cost":2,"tags":["difficult","end_move"],"ramp":false,"cliff":false},{"to":"A6","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"B8","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"e":{"to":"C7","dir":"e","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"ne":{"to":"B6","dir":"ne","passable":true,"cost":2,"tags":["difficult","end_move"],"ramp":false,"cliff":false},"nw":{"to":"A6","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"se":{"to":"B8","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}}},"B8":{"q":-4,"r":3,"col":1,"row":7,"terrain":"bush","height":0,"walkable":true,"obstacle":false,"blocksLOS":true,"ring":4,"neighbors":[{"to":"C8","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"C7","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"B7","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"C9","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"e":{"to":"C8","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"ne":{"to":"C7","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"nw":{"to":"B7","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"se":{"to":"C9","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}}},"C9":{"q":-4,"r":4,"col":2,"row":8,"terrain":"grass","height":0,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":4,"neighbors":[{"to":"D9","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"C8","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"B8","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"e":{"to":"D9","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"ne":{"to":"C8","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"nw":{"to":"B8","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}}},"A4":{"q":-3,"r":-1,"col":0,"row":3,"terrain":"grass","height":0,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":4,"neighbors":[{"to":"B4","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"B3","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"A5","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"B5","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"e":{"to":"B4","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"ne":{"to":"B3","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"A5","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"se":{"to":"B5","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}}},"B5":{"q":-3,"r":0,"col":1,"row":4,"terrain":"grass","height":0,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":3,"neighbors":[{"to":"C5","dir":"e","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"B4","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"A4","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"A5","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"A6","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"B6","dir":"se","passable":true,"cost":2,"tags":["difficult","end_move"],"ramp":false,"cliff":false}],"neighborsByDir":{"e":{"to":"C5","dir":"e","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"ne":{"to":"B4","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"nw":{"to":"A4","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"w":{"to":"A5","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"A6","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"se":{"to":"B6","dir":"se","passable":true,"cost":2,"tags":["difficult","end_move"],"ramp":false,"cliff":false}}},"B6":{"q":-3,"r":1,"col":1,"row":5,"terrain":"mud","height":0,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":3,"neighbors":[{"to":"C6","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"C5","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"B5","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"A6","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"B7","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"C7","dir":"se","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"e":{"to":"C6","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"ne":{"to":"C5","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"nw":{"to":"B5","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"w":{"to":"A6","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"B7","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"se":{"to":"C7","dir":"se","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false}}},"C7":{"q":-3,"r":2,"col":2,"row":6,"terrain":"rock","height":0,"walkable":false,"obstacle":true,"blocksLOS":true,"ring":3,"neighbors":[{"to":"D7","dir":"e","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},{"to":"C6","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"B6","dir":"nw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"B7","dir":"w","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"B8","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"C8","dir":"se","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"e":{"to":"D7","dir":"e","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},"ne":{"to":"C6","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"nw":{"to":"B6","dir":"nw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"w":{"to":"B7","dir":"w","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"B8","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"se":{"to":"C8","dir":"se","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false}}},"C8":{"q":-3,"r":3,"col":2,"row":7,"terrain":"grass","height":0,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":3,"neighbors":[{"to":"D8","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"D7","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},{"to":"C7","dir":"nw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"B8","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"C9","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"D9","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"e":{"to":"D8","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"ne":{"to":"D7","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},"nw":{"to":"C7","dir":"nw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"w":{"to":"B8","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"C9","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"se":{"to":"D9","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}}},"D9":{"q":-3,"r":4,"col":3,"row":8,"terrain":"grass","height":0,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":4,"neighbors":[{"to":"E9","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"D8","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"C8","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"C9","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"e":{"to":"E9","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"ne":{"to":"D8","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"nw":{"to":"C8","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"w":{"to":"C9","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}}},"B3":{"q":-2,"r":-2,"col":1,"row":2,"terrain":"grass","height":0,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":4,"neighbors":[{"to":"C3","dir":"e","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"B2","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"A4","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"B4","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"e":{"to":"C3","dir":"e","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"ne":{"to":"B2","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"A4","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"se":{"to":"B4","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}}},"B4":{"q":-2,"r":-1,"col":1,"row":3,"terrain":"bush","height":0,"walkable":true,"obstacle":false,"blocksLOS":true,"ring":3,"neighbors":[{"to":"C4","dir":"e","passable":true,"cost":2,"tags":["difficult","end_move"],"ramp":false,"cliff":false},{"to":"C3","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"B3","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"A4","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"B5","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"C5","dir":"se","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"e":{"to":"C4","dir":"e","passable":true,"cost":2,"tags":["difficult","end_move"],"ramp":false,"cliff":false},"ne":{"to":"C3","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"nw":{"to":"B3","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"w":{"to":"A4","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"B5","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"se":{"to":"C5","dir":"se","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false}}},"C5":{"q":-2,"r":0,"col":2,"row":4,"terrain":"deep_water","height":0,"walkable":false,"obstacle":false,"blocksLOS":false,"ring":2,"neighbors":[{"to":"D5","dir":"e","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"C4","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"B4","dir":"nw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"B5","dir":"w","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"B6","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"C6","dir":"se","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"e":{"to":"D5","dir":"e","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"ne":{"to":"C4","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"nw":{"to":"B4","dir":"nw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"w":{"to":"B5","dir":"w","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"B6","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"se":{"to":"C6","dir":"se","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false}}},"C6":{"q":-2,"r":1,"col":2,"row":5,"terrain":"grass","height":0,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":2,"neighbors":[{"to":"D6","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"D5","dir":"ne","passable":true,"cost":2,"tags":["difficult"],"ramp":false,"cliff":false},{"to":"C5","dir":"nw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"B6","dir":"w","passable":true,"cost":2,"tags":["difficult","end_move"],"ramp":false,"cliff":false},{"to":"C7","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"D7","dir":"se","passable":true,"cost":1,"tags":["uphill"],"ramp":true,"cliff":false}],"neighborsByDir":{"e":{"to":"D6","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"ne":{"to":"D5","dir":"ne","passable":true,"cost":2,"tags":["difficult"],"ramp":false,"cliff":false},"nw":{"to":"C5","dir":"nw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"w":{"to":"B6","dir":"w","passable":true,"cost":2,"tags":["difficult","end_move"],"ramp":false,"cliff":false},"sw":{"to":"C7","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"se":{"to":"D7","dir":"se","passable":true,"cost":1,"tags":["uphill"],"ramp":true,"cliff":false}}},"D7":{"q":-2,"r":2,"col":3,"row":6,"terrain":"highland","height":1,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":2,"neighbors":[{"to":"E7","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"D6","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},{"to":"C6","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":true,"cliff":false},{"to":"C7","dir":"w","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},{"to":"C8","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},{"to":"D8","dir":"se","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true}],"neighborsByDir":{"e":{"to":"E7","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"ne":{"to":"D6","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},"nw":{"to":"C6","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":true,"cliff":false},"w":{"to":"C7","dir":"w","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},"sw":{"to":"C8","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},"se":{"to":"D8","dir":"se","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true}}},"D8":{"q":-2,"r":3,"col":3,"row":7,"terrain":"grass","height":0,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":3,"neighbors":[{"to":"E8","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"E7","dir":"ne","passable":true,"cost":1,"tags":["uphill"],"ramp":true,"cliff":false},{"to":"D7","dir":"nw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},{"to":"C8","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"D9","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"E9","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"e":{"to":"E8","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"ne":{"to":"E7","dir":"ne","passable":true,"cost":1,"tags":["uphill"],"ramp":true,"cliff":false},"nw":{"to":"D7","dir":"nw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},"w":{"to":"C8","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"D9","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"se":{"to":"E9","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}}},"E9":{"q":-2,"r":4,"col":4,"row":8,"terrain":"grass","height":0,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":4,"neighbors":[{"to":"F9","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"E8","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"D8","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"D9","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"e":{"to":"F9","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"ne":{"to":"E8","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"nw":{"to":"D8","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"w":{"to":"D9","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}}},"B2":{"q":-1,"r":-3,"col":1,"row":1,"terrain":"grass","height":0,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":4,"neighbors":[{"to":"C2","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"C1","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"B3","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"C3","dir":"se","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"e":{"to":"C2","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"ne":{"to":"C1","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"B3","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"se":{"to":"C3","dir":"se","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false}}},"C3":{"q":-1,"r":-2,"col":2,"row":2,"terrain":"rock","height":0,"walkable":false,"obstacle":true,"blocksLOS":true,"ring":3,"neighbors":[{"to":"D3","dir":"e","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},{"to":"C2","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"B2","dir":"nw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"B3","dir":"w","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"B4","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"C4","dir":"se","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"e":{"to":"D3","dir":"e","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},"ne":{"to":"C2","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"nw":{"to":"B2","dir":"nw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"w":{"to":"B3","dir":"w","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"B4","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"se":{"to":"C4","dir":"se","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false}}},"C4":{"q":-1,"r":-1,"col":2,"row":3,"terrain":"mud","height":0,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":2,"neighbors":[{"to":"D4","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"D3","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},{"to":"C3","dir":"nw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"B4","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"C5","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"D5","dir":"se","passable":true,"cost":2,"tags":["difficult"],"ramp":false,"cliff":false}],"neighborsByDir":{"e":{"to":"D4","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"ne":{"to":"D3","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},"nw":{"to":"C3","dir":"nw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"w":{"to":"B4","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"C5","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"se":{"to":"D5","dir":"se","passable":true,"cost":2,"tags":["difficult"],"ramp":false,"cliff":false}}},"D5":{"q":-1,"r":0,"col":3,"row":4,"terrain":"shallow_water","height":0,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":1,"neighbors":[{"to":"E5","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"D4","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"C4","dir":"nw","passable":true,"cost":2,"tags":["difficult","end_move"],"ramp":false,"cliff":false},{"to":"C5","dir":"w","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"C6","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"D6","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"e":{"to":"E5","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"ne":{"to":"D4","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"nw":{"to":"C4","dir":"nw","passable":true,"cost":2,"tags":["difficult","end_move"],"ramp":false,"cliff":false},"w":{"to":"C5","dir":"w","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"C6","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"se":{"to":"D6","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}}},"D6":{"q":-1,"r":1,"col":3,"row":5,"terrain":"grass","height":0,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":1,"neighbors":[{"to":"E6","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"E5","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"D5","dir":"nw","passable":true,"cost":2,"tags":["difficult"],"ramp":false,"cliff":false},{"to":"C6","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"D7","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},{"to":"E7","dir":"se","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true}],"neighborsByDir":{"e":{"to":"E6","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"ne":{"to":"E5","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"nw":{"to":"D5","dir":"nw","passable":true,"cost":2,"tags":["difficult"],"ramp":false,"cliff":false},"w":{"to":"C6","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"D7","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},"se":{"to":"E7","dir":"se","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true}}},"E7":{"q":-1,"r":2,"col":4,"row":6,"terrain":"highland","height":1,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":2,"neighbors":[{"to":"F7","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"E6","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},{"to":"D6","dir":"nw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},{"to":"D7","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"D8","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":true,"cliff":false},{"to":"E8","dir":"se","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true}],"neighborsByDir":{"e":{"to":"F7","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"ne":{"to":"E6","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},"nw":{"to":"D6","dir":"nw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},"w":{"to":"D7","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"D8","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":true,"cliff":false},"se":{"to":"E8","dir":"se","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true}}},"E8":{"q":-1,"r":3,"col":4,"row":7,"terrain":"grass","height":0,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":3,"neighbors":[{"to":"F8","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"F7","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},{"to":"E7","dir":"nw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},{"to":"D8","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"E9","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"F9","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"e":{"to":"F8","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"ne":{"to":"F7","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},"nw":{"to":"E7","dir":"nw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},"w":{"to":"D8","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"E9","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"se":{"to":"F9","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}}},"F9":{"q":-1,"r":4,"col":5,"row":8,"terrain":"grass","height":0,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":4,"neighbors":[{"to":"G9","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"F8","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"E8","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"E9","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"e":{"to":"G9","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"ne":{"to":"F8","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"nw":{"to":"E8","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"w":{"to":"E9","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}}},"C1":{"q":0,"r":-4,"col":2,"row":0,"terrain":"grass","height":0,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":4,"neighbors":[{"to":"D1","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"B2","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"C2","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"e":{"to":"D1","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"B2","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"se":{"to":"C2","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}}},"C2":{"q":0,"r":-3,"col":2,"row":1,"terrain":"bush","height":0,"walkable":true,"obstacle":false,"blocksLOS":true,"ring":3,"neighbors":[{"to":"D2","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"D1","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"C1","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"B2","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"C3","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"D3","dir":"se","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true}],"neighborsByDir":{"e":{"to":"D2","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"ne":{"to":"D1","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"nw":{"to":"C1","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"w":{"to":"B2","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"C3","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"se":{"to":"D3","dir":"se","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true}}},"D3":{"q":0,"r":-2,"col":3,"row":2,"terrain":"highland","height":1,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":2,"neighbors":[{"to":"E3","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"D2","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},{"to":"C2","dir":"nw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},{"to":"C3","dir":"w","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},{"to":"C4","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},{"to":"D4","dir":"se","passable":true,"cost":1,"tags":[],"ramp":true,"cliff":false}],"neighborsByDir":{"e":{"to":"E3","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"ne":{"to":"D2","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},"nw":{"to":"C2","dir":"nw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},"w":{"to":"C3","dir":"w","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},"sw":{"to":"C4","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},"se":{"to":"D4","dir":"se","passable":true,"cost":1,"tags":[],"ramp":true,"cliff":false}}},"D4":{"q":0,"r":-1,"col":3,"row":3,"terrain":"grass","height":0,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":1,"neighbors":[{"to":"E4","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"E3","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},{"to":"D3","dir":"nw","passable":true,"cost":1,"tags":["uphill"],"ramp":true,"cliff":false},{"to":"C4","dir":"w","passable":true,"cost":2,"tags":["difficult","end_move"],"ramp":false,"cliff":false},{"to":"D5","dir":"sw","passable":true,"cost":2,"tags":["difficult"],"ramp":false,"cliff":false},{"to":"E5","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"e":{"to":"E4","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"ne":{"to":"E3","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},"nw":{"to":"D3","dir":"nw","passable":true,"cost":1,"tags":["uphill"],"ramp":true,"cliff":false},"w":{"to":"C4","dir":"w","passable":true,"cost":2,"tags":["difficult","end_move"],"ramp":false,"cliff":false},"sw":{"to":"D5","dir":"sw","passable":true,"cost":2,"tags":["difficult"],"ramp":false,"cliff":false},"se":{"to":"E5","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}}},"E5":{"q":0,"r":0,"col":4,"row":4,"terrain":"grass","height":0,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":0,"neighbors":[{"to":"F5","dir":"e","passable":true,"cost":2,"tags":["difficult"],"ramp":false,"cliff":false},{"to":"E4","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"D4","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"D5","dir":"w","passable":true,"cost":2,"tags":["difficult"],"ramp":false,"cliff":false},{"to":"D6","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"E6","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"e":{"to":"F5","dir":"e","passable":true,"cost":2,"tags":["difficult"],"ramp":false,"cliff":false},"ne":{"to":"E4","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"nw":{"to":"D4","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"w":{"to":"D5","dir":"w","passable":true,"cost":2,"tags":["difficult"],"ramp":false,"cliff":false},"sw":{"to":"D6","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"se":{"to":"E6","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}}},"E6":{"q":0,"r":1,"col":4,"row":5,"terrain":"grass","height":0,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":1,"neighbors":[{"to":"F6","dir":"e","passable":true,"cost":2,"tags":["difficult","end_move"],"ramp":false,"cliff":false},{"to":"F5","dir":"ne","passable":true,"cost":2,"tags":["difficult"],"ramp":false,"cliff":false},{"to":"E5","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"D6","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"E7","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},{"to":"F7","dir":"se","passable":true,"cost":1,"tags":["uphill"],"ramp":true,"cliff":false}],"neighborsByDir":{"e":{"to":"F6","dir":"e","passable":true,"cost":2,"tags":["difficult","end_move"],"ramp":false,"cliff":false},"ne":{"to":"F5","dir":"ne","passable":true,"cost":2,"tags":["difficult"],"ramp":false,"cliff":false},"nw":{"to":"E5","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"w":{"to":"D6","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"E7","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},"se":{"to":"F7","dir":"se","passable":true,"cost":1,"tags":["uphill"],"ramp":true,"cliff":false}}},"F7":{"q":0,"r":2,"col":5,"row":6,"terrain":"highland","height":1,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":2,"neighbors":[{"to":"G7","dir":"e","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},{"to":"F6","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},{"to":"E6","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":true,"cliff":false},{"to":"E7","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"E8","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},{"to":"F8","dir":"se","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true}],"neighborsByDir":{"e":{"to":"G7","dir":"e","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},"ne":{"to":"F6","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},"nw":{"to":"E6","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":true,"cliff":false},"w":{"to":"E7","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"E8","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},"se":{"to":"F8","dir":"se","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true}}},"F8":{"q":0,"r":3,"col":5,"row":7,"terrain":"bush","height":0,"walkable":true,"obstacle":false,"blocksLOS":true,"ring":3,"neighbors":[{"to":"G8","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"G7","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"F7","dir":"nw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},{"to":"E8","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"F9","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"G9","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"e":{"to":"G8","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"ne":{"to":"G7","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"nw":{"to":"F7","dir":"nw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},"w":{"to":"E8","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"F9","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"se":{"to":"G9","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}}},"G9":{"q":0,"r":4,"col":6,"row":8,"terrain":"grass","height":0,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":4,"neighbors":[{"to":"G8","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"F8","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"F9","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"ne":{"to":"G8","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"nw":{"to":"F8","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"w":{"to":"F9","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}}},"D1":{"q":1,"r":-4,"col":3,"row":0,"terrain":"grass","height":0,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":4,"neighbors":[{"to":"E1","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"C1","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"C2","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"D2","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"e":{"to":"E1","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"w":{"to":"C1","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"C2","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"se":{"to":"D2","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}}},"D2":{"q":1,"r":-3,"col":3,"row":1,"terrain":"grass","height":0,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":3,"neighbors":[{"to":"E2","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"E1","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"D1","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"C2","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"D3","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},{"to":"E3","dir":"se","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true}],"neighborsByDir":{"e":{"to":"E2","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"ne":{"to":"E1","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"nw":{"to":"D1","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"w":{"to":"C2","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"D3","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},"se":{"to":"E3","dir":"se","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true}}},"E3":{"q":1,"r":-2,"col":4,"row":2,"terrain":"highland","height":1,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":2,"neighbors":[{"to":"F3","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"E2","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":true,"cliff":false},{"to":"D2","dir":"nw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},{"to":"D3","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"D4","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},{"to":"E4","dir":"se","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true}],"neighborsByDir":{"e":{"to":"F3","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"ne":{"to":"E2","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":true,"cliff":false},"nw":{"to":"D2","dir":"nw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},"w":{"to":"D3","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"D4","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},"se":{"to":"E4","dir":"se","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true}}},"E4":{"q":1,"r":-1,"col":4,"row":3,"terrain":"grass","height":0,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":1,"neighbors":[{"to":"F4","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"F3","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},{"to":"E3","dir":"nw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},{"to":"D4","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"E5","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"F5","dir":"se","passable":true,"cost":2,"tags":["difficult"],"ramp":false,"cliff":false}],"neighborsByDir":{"e":{"to":"F4","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"ne":{"to":"F3","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},"nw":{"to":"E3","dir":"nw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},"w":{"to":"D4","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"E5","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"se":{"to":"F5","dir":"se","passable":true,"cost":2,"tags":["difficult"],"ramp":false,"cliff":false}}},"F5":{"q":1,"r":0,"col":5,"row":4,"terrain":"shallow_water","height":0,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":1,"neighbors":[{"to":"G5","dir":"e","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"F4","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"E4","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"E5","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"E6","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"F6","dir":"se","passable":true,"cost":2,"tags":["difficult","end_move"],"ramp":false,"cliff":false}],"neighborsByDir":{"e":{"to":"G5","dir":"e","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"ne":{"to":"F4","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"nw":{"to":"E4","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"w":{"to":"E5","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"E6","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"se":{"to":"F6","dir":"se","passable":true,"cost":2,"tags":["difficult","end_move"],"ramp":false,"cliff":false}}},"F6":{"q":1,"r":1,"col":5,"row":5,"terrain":"mud","height":0,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":2,"neighbors":[{"to":"G6","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"G5","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"F5","dir":"nw","passable":true,"cost":2,"tags":["difficult"],"ramp":false,"cliff":false},{"to":"E6","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"F7","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},{"to":"G7","dir":"se","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"e":{"to":"G6","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"ne":{"to":"G5","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"nw":{"to":"F5","dir":"nw","passable":true,"cost":2,"tags":["difficult"],"ramp":false,"cliff":false},"w":{"to":"E6","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"F7","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},"se":{"to":"G7","dir":"se","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false}}},"G7":{"q":1,"r":2,"col":6,"row":6,"terrain":"rock","height":0,"walkable":false,"obstacle":true,"blocksLOS":true,"ring":3,"neighbors":[{"to":"H7","dir":"e","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"G6","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"F6","dir":"nw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"F7","dir":"w","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},{"to":"F8","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"G8","dir":"se","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"e":{"to":"H7","dir":"e","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"ne":{"to":"G6","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"nw":{"to":"F6","dir":"nw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"w":{"to":"F7","dir":"w","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},"sw":{"to":"F8","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"se":{"to":"G8","dir":"se","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false}}},"G8":{"q":1,"r":3,"col":6,"row":7,"terrain":"grass","height":0,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":4,"neighbors":[{"to":"H7","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"G7","dir":"nw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"F8","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"G9","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"ne":{"to":"H7","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"nw":{"to":"G7","dir":"nw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"w":{"to":"F8","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"G9","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}}},"E1":{"q":2,"r":-4,"col":4,"row":0,"terrain":"grass","height":0,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":4,"neighbors":[{"to":"F1","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"D1","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"D2","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"E2","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"e":{"to":"F1","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"w":{"to":"D1","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"D2","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"se":{"to":"E2","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}}},"E2":{"q":2,"r":-3,"col":4,"row":1,"terrain":"grass","height":0,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":3,"neighbors":[{"to":"F2","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"F1","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"E1","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"D2","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"E3","dir":"sw","passable":true,"cost":1,"tags":["uphill"],"ramp":true,"cliff":false},{"to":"F3","dir":"se","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true}],"neighborsByDir":{"e":{"to":"F2","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"ne":{"to":"F1","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"nw":{"to":"E1","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"w":{"to":"D2","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"E3","dir":"sw","passable":true,"cost":1,"tags":["uphill"],"ramp":true,"cliff":false},"se":{"to":"F3","dir":"se","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true}}},"F3":{"q":2,"r":-2,"col":5,"row":2,"terrain":"highland","height":1,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":2,"neighbors":[{"to":"G3","dir":"e","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},{"to":"F2","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},{"to":"E2","dir":"nw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},{"to":"E3","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"E4","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},{"to":"F4","dir":"se","passable":true,"cost":1,"tags":[],"ramp":true,"cliff":false}],"neighborsByDir":{"e":{"to":"G3","dir":"e","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},"ne":{"to":"F2","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},"nw":{"to":"E2","dir":"nw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},"w":{"to":"E3","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"E4","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},"se":{"to":"F4","dir":"se","passable":true,"cost":1,"tags":[],"ramp":true,"cliff":false}}},"F4":{"q":2,"r":-1,"col":5,"row":3,"terrain":"grass","height":0,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":2,"neighbors":[{"to":"G4","dir":"e","passable":true,"cost":2,"tags":["difficult","end_move"],"ramp":false,"cliff":false},{"to":"G3","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"F3","dir":"nw","passable":true,"cost":1,"tags":["uphill"],"ramp":true,"cliff":false},{"to":"E4","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"F5","dir":"sw","passable":true,"cost":2,"tags":["difficult"],"ramp":false,"cliff":false},{"to":"G5","dir":"se","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"e":{"to":"G4","dir":"e","passable":true,"cost":2,"tags":["difficult","end_move"],"ramp":false,"cliff":false},"ne":{"to":"G3","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"nw":{"to":"F3","dir":"nw","passable":true,"cost":1,"tags":["uphill"],"ramp":true,"cliff":false},"w":{"to":"E4","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"F5","dir":"sw","passable":true,"cost":2,"tags":["difficult"],"ramp":false,"cliff":false},"se":{"to":"G5","dir":"se","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false}}},"G5":{"q":2,"r":0,"col":6,"row":4,"terrain":"deep_water","height":0,"walkable":false,"obstacle":false,"blocksLOS":false,"ring":2,"neighbors":[{"to":"H5","dir":"e","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"G4","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"F4","dir":"nw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"F5","dir":"w","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"F6","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"G6","dir":"se","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"e":{"to":"H5","dir":"e","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"ne":{"to":"G4","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"nw":{"to":"F4","dir":"nw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"w":{"to":"F5","dir":"w","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"F6","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"se":{"to":"G6","dir":"se","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false}}},"G6":{"q":2,"r":1,"col":6,"row":5,"terrain":"bush","height":0,"walkable":true,"obstacle":false,"blocksLOS":true,"ring":3,"neighbors":[{"to":"H6","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"H5","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"G5","dir":"nw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"F6","dir":"w","passable":true,"cost":2,"tags":["difficult","end_move"],"ramp":false,"cliff":false},{"to":"G7","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"H7","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"e":{"to":"H6","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"ne":{"to":"H5","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"nw":{"to":"G5","dir":"nw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"w":{"to":"F6","dir":"w","passable":true,"cost":2,"tags":["difficult","end_move"],"ramp":false,"cliff":false},"sw":{"to":"G7","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"se":{"to":"H7","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}}},"H7":{"q":2,"r":2,"col":7,"row":6,"terrain":"grass","height":0,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":4,"neighbors":[{"to":"H6","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"G6","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"G7","dir":"w","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"G8","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"ne":{"to":"H6","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"nw":{"to":"G6","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"w":{"to":"G7","dir":"w","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"G8","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}}},"F1":{"q":3,"r":-4,"col":5,"row":0,"terrain":"grass","height":0,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":4,"neighbors":[{"to":"G1","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"E1","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"E2","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"F2","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"e":{"to":"G1","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"w":{"to":"E1","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"E2","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"se":{"to":"F2","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}}},"F2":{"q":3,"r":-3,"col":5,"row":1,"terrain":"grass","height":0,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":3,"neighbors":[{"to":"G2","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"G1","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"F1","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"E2","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"F3","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},{"to":"G3","dir":"se","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"e":{"to":"G2","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"ne":{"to":"G1","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"nw":{"to":"F1","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"w":{"to":"E2","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"F3","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},"se":{"to":"G3","dir":"se","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false}}},"G3":{"q":3,"r":-2,"col":6,"row":2,"terrain":"rock","height":0,"walkable":false,"obstacle":true,"blocksLOS":true,"ring":3,"neighbors":[{"to":"H3","dir":"e","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"G2","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"F2","dir":"nw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"F3","dir":"w","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},{"to":"F4","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"G4","dir":"se","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"e":{"to":"H3","dir":"e","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"ne":{"to":"G2","dir":"ne","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"nw":{"to":"F2","dir":"nw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"w":{"to":"F3","dir":"w","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":true},"sw":{"to":"F4","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"se":{"to":"G4","dir":"se","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false}}},"G4":{"q":3,"r":-1,"col":6,"row":3,"terrain":"mud","height":0,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":3,"neighbors":[{"to":"H4","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"H3","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"G3","dir":"nw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"F4","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"G5","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"H5","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"e":{"to":"H4","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"ne":{"to":"H3","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"nw":{"to":"G3","dir":"nw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"w":{"to":"F4","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"G5","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"se":{"to":"H5","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}}},"H5":{"q":3,"r":0,"col":7,"row":4,"terrain":"grass","height":0,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":3,"neighbors":[{"to":"I5","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"H4","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"G4","dir":"nw","passable":true,"cost":2,"tags":["difficult","end_move"],"ramp":false,"cliff":false},{"to":"G5","dir":"w","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"G6","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"H6","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"e":{"to":"I5","dir":"e","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"ne":{"to":"H4","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"nw":{"to":"G4","dir":"nw","passable":true,"cost":2,"tags":["difficult","end_move"],"ramp":false,"cliff":false},"w":{"to":"G5","dir":"w","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"G6","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"se":{"to":"H6","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}}},"H6":{"q":3,"r":1,"col":7,"row":5,"terrain":"grass","height":0,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":4,"neighbors":[{"to":"I5","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"H5","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"G6","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"H7","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"ne":{"to":"I5","dir":"ne","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"nw":{"to":"H5","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"w":{"to":"G6","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"H7","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}}},"G1":{"q":4,"r":-4,"col":6,"row":0,"terrain":"grass","height":0,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":4,"neighbors":[{"to":"F1","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"F2","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"G2","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"w":{"to":"F1","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"F2","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"se":{"to":"G2","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}}},"G2":{"q":4,"r":-3,"col":6,"row":1,"terrain":"bush","height":0,"walkable":true,"obstacle":false,"blocksLOS":true,"ring":4,"neighbors":[{"to":"G1","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"F2","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"G3","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"H3","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"nw":{"to":"G1","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"w":{"to":"F2","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"G3","dir":"sw","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"se":{"to":"H3","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}}},"H3":{"q":4,"r":-2,"col":7,"row":2,"terrain":"grass","height":0,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":4,"neighbors":[{"to":"G2","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"G3","dir":"w","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},{"to":"G4","dir":"sw","passable":true,"cost":2,"tags":["difficult","end_move"],"ramp":false,"cliff":false},{"to":"H4","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"nw":{"to":"G2","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"w":{"to":"G3","dir":"w","passable":false,"cost":null,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"G4","dir":"sw","passable":true,"cost":2,"tags":["difficult","end_move"],"ramp":false,"cliff":false},"se":{"to":"H4","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}}},"H4":{"q":4,"r":-1,"col":7,"row":3,"terrain":"bush","height":0,"walkable":true,"obstacle":false,"blocksLOS":true,"ring":4,"neighbors":[{"to":"H3","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"G4","dir":"w","passable":true,"cost":2,"tags":["difficult","end_move"],"ramp":false,"cliff":false},{"to":"H5","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"I5","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"nw":{"to":"H3","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"w":{"to":"G4","dir":"w","passable":true,"cost":2,"tags":["difficult","end_move"],"ramp":false,"cliff":false},"sw":{"to":"H5","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"se":{"to":"I5","dir":"se","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}}},"I5":{"q":4,"r":0,"col":8,"row":4,"terrain":"grass","height":0,"walkable":true,"obstacle":false,"blocksLOS":false,"ring":4,"neighbors":[{"to":"H4","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"H5","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},{"to":"H6","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}],"neighborsByDir":{"nw":{"to":"H4","dir":"nw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"w":{"to":"H5","dir":"w","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false},"sw":{"to":"H6","dir":"sw","passable":true,"cost":1,"tags":[],"ramp":false,"cliff":false}}}},"aiEdges":[{"from":"A5","to":"B5","dir":"e","cost":1,"tags":[]},{"from":"A5","to":"A4","dir":"ne","cost":1,"tags":[]},{"from":"A5","to":"A6","dir":"se","cost":1,"tags":[]},{"from":"A6","to":"B6","dir":"e","cost":2,"tags":["difficult","end_move"]},{"from":"A6","to":"B5","dir":"ne","cost":1,"tags":[]},{"from":"A6","to":"A5","dir":"nw","cost":1,"tags":[]},{"from":"A6","to":"B7","dir":"se","cost":1,"tags":[]},{"from":"B7","to":"B6","dir":"ne","cost":2,"tags":["difficult","end_move"]},{"from":"B7","to":"A6","dir":"nw","cost":1,"tags":[]},{"from":"B7","to":"B8","dir":"se","cost":1,"tags":[]},{"from":"B8","to":"C8","dir":"e","cost":1,"tags":[]},{"from":"B8","to":"B7","dir":"nw","cost":1,"tags":[]},{"from":"B8","to":"C9","dir":"se","cost":1,"tags":[]},{"from":"C9","to":"D9","dir":"e","cost":1,"tags":[]},{"from":"C9","to":"C8","dir":"ne","cost":1,"tags":[]},{"from":"C9","to":"B8","dir":"nw","cost":1,"tags":[]},{"from":"A4","to":"B4","dir":"e","cost":1,"tags":[]},{"from":"A4","to":"B3","dir":"ne","cost":1,"tags":[]},{"from":"A4","to":"A5","dir":"sw","cost":1,"tags":[]},{"from":"A4","to":"B5","dir":"se","cost":1,"tags":[]},{"from":"B5","to":"B4","dir":"ne","cost":1,"tags":[]},{"from":"B5","to":"A4","dir":"nw","cost":1,"tags":[]},{"from":"B5","to":"A5","dir":"w","cost":1,"tags":[]},{"from":"B5","to":"A6","dir":"sw","cost":1,"tags":[]},{"from":"B5","to":"B6","dir":"se","cost":2,"tags":["difficult","end_move"]},{"from":"B6","to":"C6","dir":"e","cost":1,"tags":[]},{"from":"B6","to":"B5","dir":"nw","cost":1,"tags":[]},{"from":"B6","to":"A6","dir":"w","cost":1,"tags":[]},{"from":"B6","to":"B7","dir":"sw","cost":1,"tags":[]},{"from":"C8","to":"D8","dir":"e","cost":1,"tags":[]},{"from":"C8","to":"B8","dir":"w","cost":1,"tags":[]},{"from":"C8","to":"C9","dir":"sw","cost":1,"tags":[]},{"from":"C8","to":"D9","dir":"se","cost":1,"tags":[]},{"from":"D9","to":"E9","dir":"e","cost":1,"tags":[]},{"from":"D9","to":"D8","dir":"ne","cost":1,"tags":[]},{"from":"D9","to":"C8","dir":"nw","cost":1,"tags":[]},{"from":"D9","to":"C9","dir":"w","cost":1,"tags":[]},{"from":"B3","to":"B2","dir":"ne","cost":1,"tags":[]},{"from":"B3","to":"A4","dir":"sw","cost":1,"tags":[]},{"from":"B3","to":"B4","dir":"se","cost":1,"tags":[]},{"from":"B4","to":"C4","dir":"e","cost":2,"tags":["difficult","end_move"]},{"from":"B4","to":"B3","dir":"nw","cost":1,"tags":[]},{"from":"B4","to":"A4","dir":"w","cost":1,"tags":[]},{"from":"B4","to":"B5","dir":"sw","cost":1,"tags":[]},{"from":"C6","to":"D6","dir":"e","cost":1,"tags":[]},{"from":"C6","to":"D5","dir":"ne","cost":2,"tags":["difficult"]},{"from":"C6","to":"B6","dir":"w","cost":2,"tags":["difficult","end_move"]},{"from":"C6","to":"D7","dir":"se","cost":1,"tags":["uphill"]},{"from":"D7","to":"E7","dir":"e","cost":1,"tags":[]},{"from":"D7","to":"C6","dir":"nw","cost":1,"tags":[]},{"from":"D8","to":"E8","dir":"e","cost":1,"tags":[]},{"from":"D8","to":"E7","dir":"ne","cost":1,"tags":["uphill"]},{"from":"D8","to":"C8","dir":"w","cost":1,"tags":[]},{"from":"D8","to":"D9","dir":"sw","cost":1,"tags":[]},{"from":"D8","to":"E9","dir":"se","cost":1,"tags":[]},{"from":"E9","to":"F9","dir":"e","cost":1,"tags":[]},{"from":"E9","to":"E8","dir":"ne","cost":1,"tags":[]},{"from":"E9","to":"D8","dir":"nw","cost":1,"tags":[]},{"from":"E9","to":"D9","dir":"w","cost":1,"tags":[]},{"from":"B2","to":"C2","dir":"e","cost":1,"tags":[]},{"from":"B2","to":"C1","dir":"ne","cost":1,"tags":[]},{"from":"B2","to":"B3","dir":"sw","cost":1,"tags":[]},{"from":"C4","to":"D4","dir":"e","cost":1,"tags":[]},{"from":"C4","to":"B4","dir":"w","cost":1,"tags":[]},{"from":"C4","to":"D5","dir":"se","cost":2,"tags":["difficult"]},{"from":"D5","to":"E5","dir":"e","cost":1,"tags":[]},{"from":"D5","to":"D4","dir":"ne","cost":1,"tags":[]},{"from":"D5","to":"C4","dir":"nw","cost":2,"tags":["difficult","end_move"]},{"from":"D5","to":"C6","dir":"sw","cost":1,"tags":[]},{"from":"D5","to":"D6","dir":"se","cost":1,"tags":[]},{"from":"D6","to":"E6","dir":"e","cost":1,"tags":[]},{"from":"D6","to":"E5","dir":"ne","cost":1,"tags":[]},{"from":"D6","to":"D5","dir":"nw","cost":2,"tags":["difficult"]},{"from":"D6","to":"C6","dir":"w","cost":1,"tags":[]},{"from":"E7","to":"F7","dir":"e","cost":1,"tags":[]},{"from":"E7","to":"D7","dir":"w","cost":1,"tags":[]},{"from":"E7","to":"D8","dir":"sw","cost":1,"tags":[]},{"from":"E8","to":"F8","dir":"e","cost":1,"tags":[]},{"from":"E8","to":"D8","dir":"w","cost":1,"tags":[]},{"from":"E8","to":"E9","dir":"sw","cost":1,"tags":[]},{"from":"E8","to":"F9","dir":"se","cost":1,"tags":[]},{"from":"F9","to":"G9","dir":"e","cost":1,"tags":[]},{"from":"F9","to":"F8","dir":"ne","cost":1,"tags":[]},{"from":"F9","to":"E8","dir":"nw","cost":1,"tags":[]},{"from":"F9","to":"E9","dir":"w","cost":1,"tags":[]},{"from":"C1","to":"D1","dir":"e","cost":1,"tags":[]},{"from":"C1","to":"B2","dir":"sw","cost":1,"tags":[]},{"from":"C1","to":"C2","dir":"se","cost":1,"tags":[]},{"from":"C2","to":"D2","dir":"e","cost":1,"tags":[]},{"from":"C2","to":"D1","dir":"ne","cost":1,"tags":[]},{"from":"C2","to":"C1","dir":"nw","cost":1,"tags":[]},{"from":"C2","to":"B2","dir":"w","cost":1,"tags":[]},{"from":"D3","to":"E3","dir":"e","cost":1,"tags":[]},{"from":"D3","to":"D4","dir":"se","cost":1,"tags":[]},{"from":"D4","to":"E4","dir":"e","cost":1,"tags":[]},{"from":"D4","to":"D3","dir":"nw","cost":1,"tags":["uphill"]},{"from":"D4","to":"C4","dir":"w","cost":2,"tags":["difficult","end_move"]},{"from":"D4","to":"D5","dir":"sw","cost":2,"tags":["difficult"]},{"from":"D4","to":"E5","dir":"se","cost":1,"tags":[]},{"from":"E5","to":"F5","dir":"e","cost":2,"tags":["difficult"]},{"from":"E5","to":"E4","dir":"ne","cost":1,"tags":[]},{"from":"E5","to":"D4","dir":"nw","cost":1,"tags":[]},{"from":"E5","to":"D5","dir":"w","cost":2,"tags":["difficult"]},{"from":"E5","to":"D6","dir":"sw","cost":1,"tags":[]},{"from":"E5","to":"E6","dir":"se","cost":1,"tags":[]},{"from":"E6","to":"F6","dir":"e","cost":2,"tags":["difficult","end_move"]},{"from":"E6","to":"F5","dir":"ne","cost":2,"tags":["difficult"]},{"from":"E6","to":"E5","dir":"nw","cost":1,"tags":[]},{"from":"E6","to":"D6","dir":"w","cost":1,"tags":[]},{"from":"E6","to":"F7","dir":"se","cost":1,"tags":["uphill"]},{"from":"F7","to":"E6","dir":"nw","cost":1,"tags":[]},{"from":"F7","to":"E7","dir":"w","cost":1,"tags":[]},{"from":"F8","to":"G8","dir":"e","cost":1,"tags":[]},{"from":"F8","to":"E8","dir":"w","cost":1,"tags":[]},{"from":"F8","to":"F9","dir":"sw","cost":1,"tags":[]},{"from":"F8","to":"G9","dir":"se","cost":1,"tags":[]},{"from":"G9","to":"G8","dir":"ne","cost":1,"tags":[]},{"from":"G9","to":"F8","dir":"nw","cost":1,"tags":[]},{"from":"G9","to":"F9","dir":"w","cost":1,"tags":[]},{"from":"D1","to":"E1","dir":"e","cost":1,"tags":[]},{"from":"D1","to":"C1","dir":"w","cost":1,"tags":[]},{"from":"D1","to":"C2","dir":"sw","cost":1,"tags":[]},{"from":"D1","to":"D2","dir":"se","cost":1,"tags":[]},{"from":"D2","to":"E2","dir":"e","cost":1,"tags":[]},{"from":"D2","to":"E1","dir":"ne","cost":1,"tags":[]},{"from":"D2","to":"D1","dir":"nw","cost":1,"tags":[]},{"from":"D2","to":"C2","dir":"w","cost":1,"tags":[]},{"from":"E3","to":"F3","dir":"e","cost":1,"tags":[]},{"from":"E3","to":"E2","dir":"ne","cost":1,"tags":[]},{"from":"E3","to":"D3","dir":"w","cost":1,"tags":[]},{"from":"E4","to":"F4","dir":"e","cost":1,"tags":[]},{"from":"E4","to":"D4","dir":"w","cost":1,"tags":[]},{"from":"E4","to":"E5","dir":"sw","cost":1,"tags":[]},{"from":"E4","to":"F5","dir":"se","cost":2,"tags":["difficult"]},{"from":"F5","to":"F4","dir":"ne","cost":1,"tags":[]},{"from":"F5","to":"E4","dir":"nw","cost":1,"tags":[]},{"from":"F5","to":"E5","dir":"w","cost":1,"tags":[]},{"from":"F5","to":"E6","dir":"sw","cost":1,"tags":[]},{"from":"F5","to":"F6","dir":"se","cost":2,"tags":["difficult","end_move"]},{"from":"F6","to":"G6","dir":"e","cost":1,"tags":[]},{"from":"F6","to":"F5","dir":"nw","cost":2,"tags":["difficult"]},{"from":"F6","to":"E6","dir":"w","cost":1,"tags":[]},{"from":"G8","to":"H7","dir":"ne","cost":1,"tags":[]},{"from":"G8","to":"F8","dir":"w","cost":1,"tags":[]},{"from":"G8","to":"G9","dir":"sw","cost":1,"tags":[]},{"from":"E1","to":"F1","dir":"e","cost":1,"tags":[]},{"from":"E1","to":"D1","dir":"w","cost":1,"tags":[]},{"from":"E1","to":"D2","dir":"sw","cost":1,"tags":[]},{"from":"E1","to":"E2","dir":"se","cost":1,"tags":[]},{"from":"E2","to":"F2","dir":"e","cost":1,"tags":[]},{"from":"E2","to":"F1","dir":"ne","cost":1,"tags":[]},{"from":"E2","to":"E1","dir":"nw","cost":1,"tags":[]},{"from":"E2","to":"D2","dir":"w","cost":1,"tags":[]},{"from":"E2","to":"E3","dir":"sw","cost":1,"tags":["uphill"]},{"from":"F3","to":"E3","dir":"w","cost":1,"tags":[]},{"from":"F3","to":"F4","dir":"se","cost":1,"tags":[]},{"from":"F4","to":"G4","dir":"e","cost":2,"tags":["difficult","end_move"]},{"from":"F4","to":"F3","dir":"nw","cost":1,"tags":["uphill"]},{"from":"F4","to":"E4","dir":"w","cost":1,"tags":[]},{"from":"F4","to":"F5","dir":"sw","cost":2,"tags":["difficult"]},{"from":"G6","to":"H6","dir":"e","cost":1,"tags":[]},{"from":"G6","to":"H5","dir":"ne","cost":1,"tags":[]},{"from":"G6","to":"F6","dir":"w","cost":2,"tags":["difficult","end_move"]},{"from":"G6","to":"H7","dir":"se","cost":1,"tags":[]},{"from":"H7","to":"H6","dir":"ne","cost":1,"tags":[]},{"from":"H7","to":"G6","dir":"nw","cost":1,"tags":[]},{"from":"H7","to":"G8","dir":"sw","cost":1,"tags":[]},{"from":"F1","to":"G1","dir":"e","cost":1,"tags":[]},{"from":"F1","to":"E1","dir":"w","cost":1,"tags":[]},{"from":"F1","to":"E2","dir":"sw","cost":1,"tags":[]},{"from":"F1","to":"F2","dir":"se","cost":1,"tags":[]},{"from":"F2","to":"G2","dir":"e","cost":1,"tags":[]},{"from":"F2","to":"G1","dir":"ne","cost":1,"tags":[]},{"from":"F2","to":"F1","dir":"nw","cost":1,"tags":[]},{"from":"F2","to":"E2","dir":"w","cost":1,"tags":[]},{"from":"G4","to":"H4","dir":"e","cost":1,"tags":[]},{"from":"G4","to":"H3","dir":"ne","cost":1,"tags":[]},{"from":"G4","to":"F4","dir":"w","cost":1,"tags":[]},{"from":"G4","to":"H5","dir":"se","cost":1,"tags":[]},{"from":"H5","to":"I5","dir":"e","cost":1,"tags":[]},{"from":"H5","to":"H4","dir":"ne","cost":1,"tags":[]},{"from":"H5","to":"G4","dir":"nw","cost":2,"tags":["difficult","end_move"]},{"from":"H5","to":"G6","dir":"sw","cost":1,"tags":[]},{"from":"H5","to":"H6","dir":"se","cost":1,"tags":[]},{"from":"H6","to":"I5","dir":"ne","cost":1,"tags":[]},{"from":"H6","to":"H5","dir":"nw","cost":1,"tags":[]},{"from":"H6","to":"G6","dir":"w","cost":1,"tags":[]},{"from":"H6","to":"H7","dir":"sw","cost":1,"tags":[]},{"from":"G1","to":"F1","dir":"w","cost":1,"tags":[]},{"from":"G1","to":"F2","dir":"sw","cost":1,"tags":[]},{"from":"G1","to":"G2","dir":"se","cost":1,"tags":[]},{"from":"G2","to":"G1","dir":"nw","cost":1,"tags":[]},{"from":"G2","to":"F2","dir":"w","cost":1,"tags":[]},{"from":"G2","to":"H3","dir":"se","cost":1,"tags":[]},{"from":"H3","to":"G2","dir":"nw","cost":1,"tags":[]},{"from":"H3","to":"G4","dir":"sw","cost":2,"tags":["difficult","end_move"]},{"from":"H3","to":"H4","dir":"se","cost":1,"tags":[]},{"from":"H4","to":"H3","dir":"nw","cost":1,"tags":[]},{"from":"H4","to":"G4","dir":"w","cost":2,"tags":["difficult","end_move"]},{"from":"H4","to":"H5","dir":"sw","cost":1,"tags":[]},{"from":"H4","to":"I5","dir":"se","cost":1,"tags":[]},{"from":"I5","to":"H4","dir":"nw","cost":1,"tags":[]},{"from":"I5","to":"H5","dir":"w","cost":1,"tags":[]},{"from":"I5","to":"H6","dir":"sw","cost":1,"tags":[]}],"directions":{"e":[1,0],"ne":[1,-1],"nw":[0,-1],"w":[-1,0],"sw":[-1,1],"se":[0,1]}};

const HEX_DIRS = { e:[1,0], ne:[1,-1], nw:[0,-1], w:[-1,0], sw:[-1,1], se:[0,1] };
const HEX_DIR_NAMES = ['e','ne','nw','w','sw','se'];
function oddrToAxial(pos){ return { q: pos.c - ((pos.r - (pos.r & 1)) >> 1), r: pos.r }; }
function axialToOddr(q,r){ return { r, c: q + ((r - (r & 1)) >> 1) }; }
function hexDistance(a,b){ const A=oddrToAxial(a),B=oddrToAxial(b),dq=A.q-B.q,dr=A.r-B.r;return (Math.abs(dq)+Math.abs(dr)+Math.abs(dq+dr))/2; }
function boardCell(state,pos){ return state.board.cells?.[pos.r]?.[pos.c] || null; }
function hexStep(state,pos,dir){
  const c=boardCell(state,pos); if(!c||!c.exists)return null;
  const edge=c.neighborsByDir?.[dir]; if(!edge)return null;
  return {r:edge.row,c:edge.col,label:edge.to,edge};
}
function canTraverse(state,from,to){
  if(!to||!isWalkable(state,to.r,to.c))return false;
  const fc=boardCell(state,from);if(!fc)return false;
  const edge=Object.values(fc.neighborsByDir||{}).find(e=>e.row===to.r&&e.col===to.c);
  return !!edge?.passable;
}
function hexBestToward(state,from,target,occupied=null){
  let best=null,bestD=Infinity,bestCost=Infinity;
  for(const dir of HEX_DIR_NAMES){const n=hexStep(state,from,dir);if(!n||!canTraverse(state,from,n))continue;if(occupied&&n.r===occupied.r&&n.c===occupied.c)continue;const d=hexDistance(n,target),cost=n.edge?.cost||1;if(d<bestD||(d===bestD&&cost<bestCost)){best={...n,dir};bestD=d;bestCost=cost;}}
  return best;
}
function hexAwayDirection(state,attacker,defender){
  let best=null,bestD=-1;
  for(const dir of HEX_DIR_NAMES){const n=hexStep(state,defender,dir);if(!n)continue;const d=hexDistance(attacker,n);if(d>bestD){best=dir;bestD=d;}}
  return best;
}

/** 曼哈顿距离。 */
function dist(a,b){ return hexDistance(a,b); }

/** 是否合法格（在界内、非障碍、非封锁区）。 */
function isWalkable(state,r,c){
  const cell=state.board.cells?.[r]?.[c];
  return !!cell && cell.exists!==false && cell.walkable!==false && !cell.obstacle && cell.zone!==false;
}

// ---------------------------------------------------------------------------
// 地形规则（设计02 §5）：全部以 cell.terrain 为真值才生效，默认棋盘 terrain:null 零影响
// ---------------------------------------------------------------------------

/** 读取单格地形（highland/bush/mud），无地形返回 null。 */
function cellTerrain(state,r,c){ const cell=state.board.cells?.[r]?.[c];return cell&&cell.exists!==false?(cell.terrain||null):null; }

function edgeForMove(state,from,to){
  const cell=state.board.cells?.[from.r]?.[from.c];
  return Object.values(cell?.neighborsByDir||{}).find(e=>{
    const n=HEX_MAP_DATA.cells[e.to];return n&&n.row===to.r&&n.col===to.c;
  })||null;
}
function getReachableMovePaths(state,side,budget,{approachOnly=false,start=null}={}){
  const p=state.players[side],opp=state.players[1-side],origin=start||p.pos,startD=dist(origin,opp.pos);
  const queue=[{pos:{...origin},path:[],spent:0}],best=new Map([[`${origin.r},${origin.c}`,0]]),out=[];
  while(queue.length){
    const cur=queue.shift(),cell=state.board.cells?.[cur.pos.r]?.[cur.pos.c];
    for(const e of Object.values(cell?.neighborsByDir||{})){
      if(!e.passable)continue;const n=HEX_MAP_DATA.cells[e.to],next={r:n.row,c:n.col};
      if(next.r===opp.pos.r&&next.c===opp.pos.c||!canTraverse(state,cur.pos,next))continue;
      const cost=Math.max(1,Number(e.cost)||1),spent=cur.spent+cost;if(spent>budget)continue;
      if(approachOnly&&dist(next,opp.pos)>startD)continue;
      const key=`${next.r},${next.c}`;if((best.get(key)??Infinity)<=spent)continue;best.set(key,spent);
      const path=cur.path.concat([{...next}]),stop=(e.tags||[]).includes('end_move')||['mud','shallow_water'].includes(cellTerrain(state,next.r,next.c));
      out.push({dest:{...next},path,spent,remaining:budget-spent,relation:dist(next,opp.pos)>startD?'后退':dist(next,opp.pos)<startD?'前进':'侧移'});
      if(!stop&&spent<budget)queue.push({pos:next,path,spent});
    }
  }return out;
}
function applySelectedMovePath(state,side,path,budget,{approachOnly=false}={}){
  const p=state.players[side],opp=state.players[1-side],origin={...p.pos};if(!Array.isArray(path)||!path.length)throw new Error('没有选择移动路径');
  let spent=0;
  for(const raw of path){const next={r:Number(raw.r),c:Number(raw.c)},e=edgeForMove(state,p.pos,next);
    if(!e||!e.passable||!canTraverse(state,p.pos,next))throw new Error('所选移动路径不可通行');
    if(next.r===opp.pos.r&&next.c===opp.pos.c)throw new Error('不能移动到对手所在格');
    spent+=Math.max(1,Number(e.cost)||1);if(spent>budget)throw new Error(`移动力不足：需要${spent}，当前${budget}`);
    if(approachOnly&&dist(next,opp.pos)>dist(origin,opp.pos))throw new Error('该移动不能远离对手');
    p.pos=next;if((e.tags||[]).includes('end_move')||['mud','shallow_water'].includes(cellTerrain(state,next.r,next.c)))break;
  }return {moved:origin.r!==p.pos.r||origin.c!==p.pos.c,spent,origin,dest:{...p.pos}};
}

/** 高地远程射程加成（TERRAIN_RULE.highland.rangedBonus）。 */
const HIGHLAND_RANGED_BONUS = 1;

/**
 * 攻击有效射程：站高地且牌为远程（range>近战）时 +1。
 * 近战（range=1）不受高地影响。统一从此读取，避免 dist 与各判定点各写一套。
 */
function effectiveRange(state,attackerSide,card){
  const p=state.players[attackerSide],def=state.players[1-attackerSide];let range=card.range||CONST.MELEE_RANGE;
  if(card.conditionalRange){const lastLog=state.chain[state.chain.length-1]||null;if(checkCondition(card.conditionalRange.condition,{state,attacker:attackerSide,defender:1-attackerSide,card,lastLog}))range=Math.max(range,card.conditionalRange.range)}
  if(card.consumeFateLine&&def.mechanics.fateLineFrom===attackerSide)range=Math.max(range,card.fateLineRange||3);
  if(card.timing==='follow'&&p.hero.id==='baiye'&&(p.mechanics.baiyeWaterDamageArmed||p.mechanics.baiyeWindArmed))range+=1;
  if(card.timing==='follow'&&p.hero.id==='lanyu'&&p.mechanics.lanyuCryArmed&&card.condition==='fly')range+=1;
  if(card.timing==='starter'&&p.mechanics.xuanyiHiddenNeedleReady)range+=1;
  if(range>CONST.MELEE_RANGE&&cellTerrain(state,p.pos.r,p.pos.c)==='highland')range+=HIGHLAND_RANGED_BONUS;
  return range;
}

/**
 * 资源点连占分级奖励（设计02 §3，引擎侧规则真源，避免 engine→data 依赖）。
 * 1→气1能1 / 2→气2能1 / 3+→气2能2摸1。
 */
// 引擎侧资源分级真源（避免 engine→data 依赖）。命名加 ENGINE_ 前缀，
// 与 data/maps.js 的 RESOURCE_TIERS/resourceTier 区分，规避 build 顶层标识符冲突。
const ENGINE_RESOURCE_TIERS = [
  { streak: 1, qi: 1, energy: 1, draw: 0 },
  { streak: 2, qi: 2, energy: 1, draw: 0 },
  { streak: 3, qi: 2, energy: 2, draw: 1 },
];
function engineResourceTier(streak) {
  if (streak >= 3) return ENGINE_RESOURCE_TIERS[2];
  if (streak === 2) return ENGINE_RESOURCE_TIERS[1];
  return ENGINE_RESOURCE_TIERS[0];
}

/** 造成治疗。 */
function heal(state, side, amount) {
  const p = state.players[side];
  const before = p.hp;
  p.hp = Math.min(p.hero.hp, p.hp + amount);
  const actual = p.hp - before;
  if (actual > 0) {
    addStatus(state, side, INSTANT.HEALED_TICK, 'heal');
    emitV7Event(state,{type:'HEAL_RESOLVED',actorId:side,side,actualHeal:actual,payload:{amount:actual}});
  }
  return actual;
}

/** 获得气。combat=true 表示战斗产气（受每大回合上限）。 */
function gainQi(state, side, amount, { combat = false } = {}) {
  const p = state.players[side];
  let n = amount;
  if (combat) {
    const room = CONST.QI_PER_ROUND_CAP - p.mechanics.qiThisRound;
    n = Math.max(0, Math.min(n, room));
    p.mechanics.qiThisRound += n;
  }
  const beforeQi=p.qi;
  p.qi = Math.min(CONST.QI_MAX, p.qi + n);
  const actual=p.qi-beforeQi;
  if(actual>0)emitV7Event(state,{type:'QI_GAINED',actorId:side,side,amount:actual,payload:{amount:actual,combat}});
  return actual;
}

/** 白夜进化羽：3羽觉醒，觉醒时天鹅王冠回4。 */
function gainBaiyeFeather(state, side, amount) {
  const p = state.players[side];
  if (p.hero.id !== 'baiye') return 0;
  const before = p.mechanics.feathers || 0;
  p.mechanics.feathers = Math.min(5, before + amount);
  if (p.mechanics.feathers >= 3 && !p.mechanics.awakened) {
    p.mechanics.awakened = true;
    if (p.hero.mechanics.some((m) => m.id === 'swan_crown')) heal(state, side, 4);
  }
  return p.mechanics.feathers - before;
}

/**
 * 可复现 PRNG（mulberry32 的有状态版本）。
 * rngState 存在 GameState 中，可被 structuredClone 事务安全地复制/回滚。
 */
function random(state) {
  state.rngState = ((state.rngState ?? 1) + 0x6D2B79F5) >>> 0;
  let t = state.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** 抽牌。牌堆空则用当前对局 PRNG 洗弃牌堆；仍空则跳过。 */
function drawCards(state, side, n) {
  const p = state.players[side];
  const drawn = [];
  let reshuffled = false;
  for (let i = 0; i < n; i++) {
    if (!p.deck.length) {
      if (!p.discard.length) break;
      p.deck = shuffle(p.discard, state);
      p.discard = [];
      reshuffled = true;
    }
    const c = p.deck.pop();
    p.hand.push(c);
    drawn.push(c);
  }
  // 法尤姆命运编织：摸牌进度与洗牌收益集中在公共入口，
  // 避免卡牌、技能、整备补牌各写一套并静默漏算。
  if (p.hero.id === 'fayoum') {
    p.mechanics.drawProgress = (p.mechanics.drawProgress || 0) + drawn.length;
    let gained = 0;
    while (p.mechanics.drawProgress >= 3) {
      p.mechanics.drawProgress -= 3;
      p.mechanics.fate = (p.mechanics.fate || 0) + 1;
      gained += 1;
    }
    if (reshuffled) {
      p.mechanics.fate = (p.mechanics.fate || 0) + 1;
      gained += 1;
    }
    if (gained > 0) {
      state.log.push({
        type: 'mechanic', side, mechanic: 'fate_weave', gained, drawn: drawn.length, reshuffled,
      });
    }
  }
  return drawn;
}

/**
 * 岚羽永翔之魂：本大回合首次进飞行的免费额度是否可用。
 * 条件：岚羽、当前未飞行、本大回合免费额度未用。
 * 费用减免在 computeCost / skillCost 读取；额度消费统一在 enterFlying。
 */
function lanyuFreeFlyAvailable(state, side) {
  const p = state.players[side];
  return p.hero.id === 'lanyu'
    && !hasStatus(p, PERSISTENT.FLYING)
    && !p.mechanics.lanyuFreeFlyUsedThisRound;
}

/**
 * 进入飞行的唯一公共入口。
 * 岚羽永翔之魂的额度消费集中在这里：只要是“从非飞行进入飞行”且额度未用，
 * 无论来源是技能还是卡牌，都记账一次，避免各入口各写一套并静默漏算。
 */
function enterFlying(state, side, source) {
  const p = state.players[side];
  // 必须在 addStatus 之前取快照：addStatus 之后 hasStatus(flying) 必为真，
  // 再放行 lanyuFreeFlyAvailable 会永远判定不可用。
  const freeEntry = lanyuFreeFlyAvailable(state, side);
  const st = addStatus(state, side, PERSISTENT.FLYING, source);
  if (freeEntry) {
    p.mechanics.lanyuFreeFlyUsedThisRound = true;
    state.log.push({ type: 'mechanic', side, mechanic: 'eternal_soar', source });
  }
  return st;
}

/** 弃牌堆顶 n 张（cycle 用）。 */
function cycleCard(state, side, n) {
  const p = state.players[side];
  for (let i = 0; i < n && p.hand.length; i++) {
    p.discard.push(p.hand.shift());
  }
  drawCards(state, side, n);
}

/** 观星：看牌堆顶 n 张（简化实现：仅记录日志，不重排）。 */
function beginDeckOrderTransaction(state, side, n, purpose='scry') {
  if (state.pendingChoice) throw new Error('已有未完成选择');
  const p=state.players[side], count=Math.max(0,Math.min(n,p.deck.length));
  const cards=p.deck.slice(-count);
  const tx={
    id:nextV701Id(state,'choice'), type:'DECK_ORDER', side, purpose, count,
    originalDeck:p.deck.slice(), cards:cards.slice(), cardKeys:cards.map((c,i)=>c.instanceId||c.id||`${c.name}#${i}`)
  };
  state.pendingChoice=tx;
  state.log.push({type:'deck_order_started',side,count,purpose});
  return tx;
}
function peekTopCards(state, side, n) { return state.players[side].deck.slice(-n).slice().reverse(); }
function getPendingChoiceOptions(state) {
  if(!state.pendingChoice)return null;
  return {id:state.pendingChoice.id,type:state.pendingChoice.type,side:state.pendingChoice.side,cards:state.pendingChoice.cards.slice()};
}
function submitPendingChoice(state, choiceId, order) {
  const tx=state.pendingChoice;
  if(!tx||tx.id!==choiceId||tx.type!=='DECK_ORDER')throw new Error('牌序选择不存在');
  if(!Array.isArray(order)||order.length!==tx.cards.length)throw new Error('提交牌数不一致');
  const key=(c,i)=>c.instanceId||c.id||`${c.name}#${tx.cards.indexOf(c)}`;
  const expected=tx.cards.map((c,i)=>c.instanceId||c.id||`${c.name}#${i}`).sort();
  const actual=order.map((c,i)=>{
    const idx=tx.cards.indexOf(c);
    return c.instanceId||c.id||`${c.name}#${idx}`;
  }).sort();
  if(expected.join('|')!==actual.join('|')||new Set(order).size!==order.length)throw new Error('提交内容必须与原牌集合完全一致');
  const p=state.players[tx.side];
  p.deck=p.deck.slice(0,p.deck.length-tx.count).concat(order.slice().reverse());
  state.pendingChoice=null;
  emitV7Event(state,{type:'DECK_REORDERED',actorId:tx.side,payload:{count:tx.count,purpose:tx.purpose,order:order.map(c=>c.name)}});
  state.log.push({type:'deck_reordered',side:tx.side,cards:order.map(c=>c.name)});
  return true;
}
function commitDeckOrder(state, order) {
  if(!state.pendingChoice)throw new Error('没有待提交牌序');
  return submitPendingChoice(state,state.pendingChoice.id,order);
}
function cancelDeckOrderTransaction(state) {
  if(!state.pendingChoice)return false;
  state.pendingChoice=null;
  state.log.push({type:'deck_order_cancelled'});
  return true;
}
function scry(state, side, n) {
  const tx=beginDeckOrderTransaction(state,side,n,'scry');
  // AI/无界面兼容：默认保持原顺序；UI可在动作结算后重新提交排序。
  state.log.push({ type:'scry',side,cards:tx.cards.slice().reverse().map(c=>c.name),pendingChoiceId:tx.id });
  return tx;
}

/** 随机弃对手 n 张手牌（使用对局 PRNG，可复现）。 */
function discardRandom(state, side, n) {
  const p = state.players[side];
  for (let i = 0; i < n && p.hand.length; i++) {
    const idx = Math.floor(random(state) * p.hand.length);
    p.discard.push(p.hand.splice(idx, 1)[0]);
  }
}

/** 洗牌（Fisher-Yates）。state 存在时使用对局 PRNG，否则仅用于兼容旧调用。 */
function shuffle(arr, state = null) {
  const a = arr.slice();
  const rng = state ? () => random(state) : Math.random;
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 伤害结算（含护盾/僵直税/衰减/气经济/角色机制）。
 * @returns {number} 实际扣血
 */
function damage(state, side, amount, source, { isSelf = false } = {}) {
  const p = state.players[side];
  let dmg = amount;

  // 护盾：抵消下一次敌方来源 1 伤
  if (!isSelf) {
    const shield = getStatus(p, PERSISTENT.SHIELD);
    if (shield && dmg > 0) {
      dmg = Math.max(0, dmg - 1);
      removeStatus(state, side, PERSISTENT.SHIELD);
    }
  }

  // 白夜·雏羽护心：启动后抵消下一次敌方伤害2，并获得1进化羽。
  if (!isSelf && p.mechanics.chickGuard && dmg > 0) {
    dmg = Math.max(0, dmg - 2);
    p.mechanics.chickGuard = false;
    gainBaiyeFeather(state, side, 1);
  }

  const before = p.hp;
  p.hp = Math.max(0, p.hp - dmg);
  const actual = before - p.hp;
  if(actual>0)emitV7Event(state,{type:'HP_LOST',actorId:side,targetSide:side,amount:actual,isSelf,source,payload:{amount:actual,isSelf,source}});

  // 洛基 hardy：每大回合首次失血+1气并回1血（R7 Pass4: +回1血，补给通胀移除后补续航）
  if (actual > 0 && !isSelf && p.hero.id === 'luoji' && !p.mechanics.firstBloodThisRound) {
    p.mechanics.firstBloodThisRound = true;
    gainQi(state, side, 1, { combat: false });
    heal(state, side, 1);
  }
  // 洛基 adversity_heart：每大回合首次受伤后下一击+1
  if (actual > 0 && !isSelf && p.hero.id === 'luoji' && !p.mechanics.firstHurtThisRound) {
    p.mechanics.firstHurtThisRound = true;
    p.mechanics.luojiRoarBuff = Math.max(p.mechanics.luojiRoarBuff, 1);
  }
  // 囚徒终极改造：监听所有真实自损入口；每大回合首次自损后摸1。
  // 统一放在 damage()，避免卡牌自损、技能自损与过载自损各写一套并静默漏算。
  if (actual > 0 && isSelf && p.hero.id === 'qiu013' && !p.mechanics.qiuFirstSelfDamageThisRound) {
    p.mechanics.qiuFirstSelfDamageThisRound = true;
    drawCards(state, side, 1);
    state.log.push({ type: 'mechanic', side, mechanic: 'ultimate_mod', source, amount: actual });
  }
  // V6 气经济：单次受≥3伤+1气
  if (actual >= CONST.BIG_HIT_THRESHOLD && !isSelf) {
    gainQi(state, side, CONST.QI_ON_BIG_HIT, { combat: true });
  }
  return actual;
}

/**
 * 击退结算：从 attacker 向 defender 方向推 n 格。
 * 撞墙（边界/障碍/封锁区）则触发 wall_hit 并 +1 伤。
 * 飞行免疫击退。
 */
function knockback(ctx,n){
  const {state,attacker,defender,log}=ctx,atk=state.players[attacker],def=state.players[defender];
  if(hasStatus(def,PERSISTENT.FLYING)){log.note+='飞行免疫击退;';return;}
  let amount=n;if(atk.mechanics.sunDance||atk.mechanics.chiyuHornArmed)amount+=1;
  const dir=hexAwayDirection(state,atk.pos,def.pos);let wallHit=false,moved=0;
  for(let i=0;i<amount;i++){
    const next=hexStep(state,def.pos,dir);if(!next||!canTraverse(state,def.pos,next)||(next.r===atk.pos.r&&next.c===atk.pos.c)){wallHit=true;break;}
    def.pos={r:next.r,c:next.c};moved++;if(['mud','shallow_water'].includes(cellTerrain(state,def.pos.r,def.pos.c)))break;
  }
  if(moved>0){addStatus(state,defender,INSTANT.KNOCKED,ctx.card.name);log.statusApplied.push(INSTANT.KNOCKED);}
  if(wallHit){addStatus(state,defender,INSTANT.WALL_HIT,ctx.card.name);let wallDmg=1;if(atk.mechanics.cornerStorm)wallDmg+=2;damage(state,defender,wallDmg,'wall_hit');log.note+=`撞墙+${wallDmg};`;log.statusApplied.push(INSTANT.WALL_HIT);}
  if(moved>0&&atk.hero.id==='chiyu'&&!atk.mechanics.knockAdvanceUsed){atk.mechanics.knockAdvanceUsed=true;const step=hexBestToward(state,atk.pos,def.pos,def.pos);if(step)atk.pos={r:step.r,c:step.c};}
  if((moved>0||wallHit)&&(ctx.card.grantFollowStep||atk.mechanics.chiyuHornArmed)){
    atk.mechanics.followStepAvailable=Math.max(atk.mechanics.followStepAvailable,ctx.card.grantFollowStep||1);
  }
  if(wallHit&&atk.mechanics.chiyuHornArmed)gainQi(state,attacker,1,{combat:false});
  if(atk.mechanics.chiyuHornArmed)atk.mechanics.chiyuHornArmed=false;
}

/** 攻击方向目标移动 n 格（用于 move/move2 效果）。 */
function finalizeMoveMechanics(state,side,before){
  const p=state.players[side];
  if(before.r===p.pos.r&&before.c===p.pos.c)return false;
  const opp=state.players[1-side],beforeD=dist(before,opp.pos),afterD=dist(p.pos,opp.pos);
  emitV7Event(state,{type:'POSITION_CHANGED',actorId:side,side,from:{...before},to:{...p.pos},distance:dist(before,p.pos),approachDelta:Math.max(0,beforeD-afterD),retreatDelta:Math.max(0,afterD-beforeD),lateral:beforeD===afterD});
  if(p.mechanics.lakeDance)p.mechanics.lakeDanceCharges+=1;
  if(p.hero.id==='youying'&&p.mechanics.momentumUsedThisExpansion<2)p.mechanics.momentumArmed=true;
  if(p.mechanics.baiyeWaterMoveArmed){p.mechanics.baiyeWaterMoveArmed=false;p.mechanics.baiyeWaterDamageArmed=true;}
  return true;
}
function moveToward(ctx,n,{optional=false}={}){
  const {state,attacker,defender}=ctx,atk=state.players[attacker],def=state.players[defender];let steps=n+(atk.mechanics.baiyeWaterMoveArmed?1:0);
  const frozen=getStatus(atk,PERSISTENT.FROZEN);if(frozen){steps=Math.max(0,steps-1);removeStatus(state,attacker,PERSISTENT.FROZEN);}
  const before={...atk.pos};
  for(let i=0;i<steps;i++){
    if(dist(atk.pos,def.pos)<=CONST.MELEE_RANGE)break;
    const next=hexBestToward(state,atk.pos,def.pos,def.pos);
    if(!next||dist(next,def.pos)>=dist(atk.pos,def.pos))break;
    atk.pos={r:next.r,c:next.c};
    if(['mud','shallow_water'].includes(cellTerrain(state,atk.pos.r,atk.pos.c)))break;
  }
  finalizeMoveMechanics(state,attacker,before);
}
function moveTowardWithinBudget(ctx,n){
  const {state,attacker,defender}=ctx,atk=state.players[attacker],def=state.players[defender];
  const before={...atk.pos};
  const options=getReachableMovePaths(state,attacker,n)
    .sort((a,b)=>dist(a.dest,def.pos)-dist(b.dest,def.pos)||b.spent-a.spent);
  const best=options[0];
  if(best&&dist(best.dest,def.pos)<dist(before,def.pos)){
    applySelectedMovePath(state,attacker,best.path,n);
    finalizeMoveMechanics(state,attacker,before);
    return true;
  }
  return false;
}
function canBridgeToRange(state,side,budget,range){
  if(dist(state.players[side].pos,state.players[1-side].pos)<=range)return true;
  return getReachableMovePaths(state,side,budget)
    .some(item=>dist(item.dest,state.players[1-side].pos)<=range);
}

function moveSelectedOrToward(ctx,n){
  const {state,attacker,opts,card}=ctx,atk=state.players[attacker],selected=Array.isArray(opts?.movePath)?opts.movePath:null;
  if(!selected||!selected.length){moveToward(ctx,n);return}
  let budget=n+(atk.mechanics.baiyeWaterMoveArmed?1:0);const frozen=getStatus(atk,PERSISTENT.FROZEN);
  if(frozen){budget=Math.max(0,budget-1);removeStatus(state,attacker,PERSISTENT.FROZEN)}
  const before={...atk.pos},r=applySelectedMovePath(state,attacker,selected,budget,{approachOnly:!!card?.approachOnly});
  if(!r.moved)throw new Error('没有完成移动');finalizeMoveMechanics(state,attacker,before);
}
function moveAway(ctx,n,{optional=false}={}){
  const {state,attacker,defender}=ctx,atk=state.players[attacker],def=state.players[defender],before={...atk.pos};
  for(let i=0;i<n;i++){
    let best=null,bestD=hexDistance(atk.pos,def.pos);
    for(const dir of HEX_DIR_NAMES){
      const next=hexStep(state,atk.pos,dir);
      if(!next||!canTraverse(state,atk.pos,next)||(next.r===def.pos.r&&next.c===def.pos.c))continue;
      const d=hexDistance(next,def.pos);
      if(d>bestD){best=next;bestD=d;}
    }
    if(!best)break;
    atk.pos={r:best.r,c:best.c};
    if(['mud','shallow_water'].includes(cellTerrain(state,atk.pos.r,atk.pos.c)))break;
  }
  finalizeMoveMechanics(state,attacker,before);
}

/** 能量游码：从对手抽 n 能，受 ENERGY_DRAIN_FLOOR / ENERGY_DRAIN_CAP 保护。 */
function drainEnergy(ctx, n) {
  const { state, attacker, defender, log } = ctx;
  const atk = state.players[attacker];
  const def = state.players[defender];
  if (atk.mechanics.energyDrainThisExpansion >= CONST.ENERGY_DRAIN_CAP) {
    log.note += '能量抽取达本展开上限;';
    return;
  }
  const room = def.energy - CONST.ENERGY_DRAIN_FLOOR;
  const take = Math.max(0, Math.min(n, room));
  if (take > 0) {
    def.energy -= take;
    atk.energy = Math.min(CONST.ENERGY_MAX, atk.energy + take);
    atk.mechanics.energyDrainThisExpansion += 1;
    log.note += `抽能${take};`;
  }
}

// 注入到效果 ctx 的 engine 辅助表
const ENGINE_HELPERS = {
  knockback, moveToward, moveSelectedOrToward, moveAway, drainEnergy, damage, heal, gainQi, gainBaiyeFeather,
  drawCards, cycleCard, scry, discardRandom, enterFlying,
};


// ---------------------------------------------------------------------------
// V7 Core：展开、事件账本与结构化条件
// ---------------------------------------------------------------------------

function nextV701Id(state, kind) {
  state.idCounters = state.idCounters || { event:0, mainAction:1, chain:0, response:0, choice:0 };
  state.idCounters[kind] = (state.idCounters[kind] || 0) + 1;
  return `${kind}-${state.idCounters[kind]}`;
}
function makeExpansionLedger() {
  // eventLedger 位于 GameState 内，必须始终保持为 structuredClone 可复制的纯数据。
  // 查询、计数、求和由外部条件函数读取 events，禁止把函数挂到账本实例上。
  return {
    attacksResolved: 0, attacksResolvedBySide: [0,0], cardsPlayedBySide: [0,0],
    activeCardsPlayed: 0, followCardsPlayed: 0, counterCardsPlayed: 0,
    damageDeclaredBySide: [0,0], effectiveDamageBySide: [0,0], hpLostBySide: [0,0],
    shieldLostBySide: [0,0], selfDamageBySide: [0,0], reflectedDamageBySide: [0,0],
    movedBySide: [false,false], approachDistanceBySide: [0,0], retreatDistanceBySide: [0,0],
    lateralMovesBySide: [0,0], forcedMoveDistanceBySide: [0,0], healedBySide: [0,0],
    shieldGainedBySide: [0,0], qiGainedBySide: [0,0], energyGainedBySide: [0,0],
    statusesApplied: [], postureEvents: [], initiativeTransfers: 0, successfulCountersBySide: [0,0], events: []
  };
}
function ruleMainActionSide(state) {
  if (state.mainActionSide !== 0 && state.mainActionSide !== 1) throw new Error('mainActionSide 缺失或非法');
  return state.mainActionSide;
}
function ruleInitiativeSide(state) {
  if (state.expansion) {
    const side = state.expansion.initiativeSide;
    if (side !== 0 && side !== 1) throw new Error('expansion.initiativeSide 缺失或非法');
    return side;
  }
  return ruleMainActionSide(state);
}
function ruleActorSide(state) {
  if (state.pendingChoice) return state.pendingChoice.side;
  if (state.phase === PHASE.RESPONSE_WINDOW && state.pendingCard) return 1 - state.pendingCard.attackerSide;
  return ruleInitiativeSide(state);
}
function setMainActionSide(state, side, reason='set') {
  if (side !== 0 && side !== 1) throw new Error('mainActionSide 非法');
  state.mainActionSide = side;
  state.mainTurnOwner = side;
  // turn 仅作为兼容镜像；展开存在时镜像展开主动权，否则镜像主行动权。
  if (!state.expansion) state.turn = side;
  state.log.push({type:'main_action_side',side,reason});
}
function startExpansion(state, originSide) {
  return ensureExpansion(state, originSide);
}
function transferExpansionInitiative(state, toSide, source='rule') {
  const exp = ensureExpansion(state, ruleMainActionSide(state));
  if (exp.initiativeTransferCount >= exp.maxInitiativeTransfers) throw new Error('本展开主动权转移次数已达上限');
  const from = exp.initiativeSide;
  exp.initiativeTransferCount++;
  exp.initiativeSide = toSide;
  state.initiativeSide = toSide;
  state.turn = toSide;
  exp.chainId = nextV701Id(state,'chain');
  emitV7Event(state,{type:'INITIATIVE_TRANSFER',actorId:toSide,from,to:toSide,source});
}
function syncOwnershipMirrors(state) {
  state.roundFirstPlayer = state.roundFirstPlayer ?? state.roundOwner ?? ruleMainActionSide(state);
  state.roundOwner = state.roundFirstPlayer; // 兼容镜像
  state.mainActionSide = state.mainActionSide ?? state.mainTurnOwner;
  state.mainTurnOwner = state.mainActionSide;
  const init = state.expansion?.initiativeSide ?? state.mainActionSide;
  state.initiativeSide = init;
  state.turn = init;
}
function ensureExpansion(state, originSide) {
  syncOwnershipMirrors(state);
  const creating = !state.expansion;
  if (creating) {
    state.players.forEach(p=>{ p.mechanics.riskyStruggleUsedThisExpansion=false; });
    state.expansion = {
      id: `exp-${state.expansionCount+1}-${state.rngState}`,
      roundId: state.round,
      mainActionId: `main-${state.idCounters?.mainAction || 1}`,
      mainActionSide: state.mainActionSide,
      mainTurnOwner: state.mainActionSide,
      initiativeSide: originSide,
      originSide,
      attackCount: 0,
      maxAttacks: 8,
      initiativeTransferCount: 0,
      maxInitiativeTransfers: 1,
      chainId: nextV701Id(state,'chain'),
      responseCount: 0,
      usedCardInstanceIds: [],
      eventLedger: makeExpansionLedger(),
      pendingAttack: null,
      endedReason: null,
    };
    state.initiativeSide = originSide;
    state.turn = originSide;
  }
  return state.expansion;
}
// Phase 4: command-local event sink. It is module-private and never stored in GameState,
 // so ExpansionLedger remains the single authoritative expansion-history store.
let __activeCommandEventSink = null;
function emitV7Event(state, event) {
  if (!state.expansion) return null;
  const exp = state.expansion;
  const L = exp.eventLedger;
  const eventId = nextV701Id(state,'event');
  const sequence = state.idCounters?.event || 0;
  const normalized = {
    eventId,
    sequence,
    roundId: state.round,
    mainActionId: exp.mainActionId,
    expansionId: exp.id,
    chainId: event.chainId || exp.chainId,
    responseWindowId: event.responseWindowId || state.responseWindow?.id || null,
    actorId: event.actorId ?? event.side ?? event.sourceSide ?? null,
    sourceCardId: event.sourceCardId ?? event.source ?? event.card ?? null,
    targetIds: event.targetIds ?? (event.targetSide !== undefined ? [event.targetSide] : []),
    type: event.type,
    payload: event.payload || {},
    ...event
  };
  L.events.push(normalized);
  if (__activeCommandEventSink) __activeCommandEventSink.push(clone(normalized));
  if (normalized.type === 'ATTACK_RESOLVED') {
    const s=normalized.side ?? normalized.actorId;
    L.attacksResolved++;
    if (s===0||s===1) L.attacksResolvedBySide[s]++;
    exp.attackCount++;
    if (exp.attackCount >= exp.maxAttacks) exp.attackLimitReached = true;
  }
  if (normalized.type === 'CARD_PLAYED') {
    const s=normalized.side ?? normalized.actorId;
    if (s===0||s===1) L.cardsPlayedBySide[s]++;
    if (normalized.mode === 'active') L.activeCardsPlayed++;
    if (normalized.mode === 'follow') L.followCardsPlayed++;
    if (normalized.mode === 'counter') L.counterCardsPlayed++;
  }
  if (normalized.type === 'DAMAGE_RESOLVED' || normalized.type === 'DAMAGE_APPLIED') {
    const ss=normalized.sourceSide ?? normalized.actorId, ts=normalized.targetSide ?? normalized.targetIds?.[0];
    if (ss===0||ss===1) {
      L.damageDeclaredBySide[ss] += normalized.declared || normalized.payload?.declared || 0;
      L.effectiveDamageBySide[ss] += normalized.hpLost || normalized.effectiveAmount || normalized.payload?.effectiveAmount || 0;
    }
    if (ts===0||ts===1) {
      L.shieldLostBySide[ts] += normalized.shieldAbsorbed || normalized.payload?.shieldAbsorbed || 0;
    }
  }
  if (normalized.type === 'HP_LOST') {
    const ts=normalized.targetSide ?? normalized.actorId ?? normalized.targetIds?.[0];
    const amount=normalized.amount ?? normalized.payload?.amount ?? 0;
    if (ts===0||ts===1) {
      L.hpLostBySide[ts] += amount;
      if (normalized.isSelf || normalized.payload?.isSelf) L.selfDamageBySide[ts] += amount;
    }
  }
  if (normalized.type === 'QI_GAINED') { const s=normalized.side ?? normalized.actorId; if(s===0||s===1)L.qiGainedBySide[s]+=normalized.amount ?? normalized.payload?.amount ?? 0; }
  if (normalized.type === 'ENERGY_GAINED') { const s=normalized.side ?? normalized.actorId; if(s===0||s===1)L.energyGainedBySide[s]+=normalized.amount ?? normalized.payload?.amount ?? 0; }
  if (normalized.type === 'MOVE_RESOLVED' || normalized.type === 'POSITION_CHANGED') {
    const s=normalized.side ?? normalized.actorId;
    if (s===0||s===1) {
      L.movedBySide[s] = true;
      if (normalized.approachDelta > 0) L.approachDistanceBySide[s] += normalized.approachDelta;
      if (normalized.retreatDelta > 0) L.retreatDistanceBySide[s] += normalized.retreatDelta;
      if (normalized.lateral) L.lateralMovesBySide[s]++;
      if (normalized.forced) L.forcedMoveDistanceBySide[s] += normalized.distance || 0;
    }
  }
  if (normalized.type === 'HEAL_RESOLVED') L.healedBySide[normalized.side] += normalized.actualHeal || 0;
  if (normalized.type === 'STATUS_APPLIED') {
    L.statusesApplied.push(normalized);
    if (normalized.category === 'posture') L.postureEvents.push(normalized);
  }
  if (normalized.type === 'INITIATIVE_TRANSFER') L.initiativeTransfers++;
  if (normalized.type === 'COUNTER_SUCCEEDED') { const cs=normalized.side ?? normalized.actorId; if (cs===0||cs===1) L.successfulCountersBySide[cs]++; }
  return normalized;
}
function ledgerScopeEvents(state, spec, ctx) {
  const L=state.expansion?.eventLedger; if(!L)return [];
  return L.events.filter(e=>{
    if(spec.type && e.type!==spec.type)return false;
    const side = spec.side==='self'||spec.source==='self' ? ctx.attacker : spec.side==='enemy'||spec.source==='enemy' ? ctx.defender : spec.side;
    if(side!==undefined && side!==null && ![e.side,e.actorId,e.sourceSide].includes(side))return false;
    return true;
  });
}
function v7LedgerValue(state, side, key) {
  const L = state.expansion?.eventLedger;
  if (!L) return 0;
  const map = {
    attacksResolved: L.attacksResolvedBySide?.[side] ?? 0, cardsPlayed: L.cardsPlayedBySide?.[side] ?? 0,
    totalAttacksResolved: L.attacksResolved, activeCardsPlayed: L.activeCardsPlayed,
    followCardsPlayed: L.followCardsPlayed, counterCardsPlayed: L.counterCardsPlayed,
    effectiveDamage: L.effectiveDamageBySide[side], hpLost: L.hpLostBySide[side],
    selfDamage: L.selfDamageBySide[side], moved: L.movedBySide[side],
    approachDistance: L.approachDistanceBySide[side], retreatDistance: L.retreatDistanceBySide[side],
    lateralMoves: L.lateralMovesBySide[side], forcedMoveDistance: L.forcedMoveDistanceBySide[side],
    healed: L.healedBySide[side], successfulCounters: L.successfulCountersBySide[side], initiativeTransfers: L.initiativeTransfers,
  };
  return map[key] ?? 0;
}
function ledgerHasEventType(state, type, side=null) {
  const events=state.expansion?.eventLedger?.events || [];
  return events.some(e=>e.type===type && (side===null || [e.side,e.actorId,e.targetSide,e.sourceSide].includes(side)));
}
function expansionHistoryFact(state, side, key) {
  // Phase 3：展开过程事实只允许来自 ExpansionLedger；不再回退 mechanics 镜像。
  return v7LedgerValue(state,side,key);
}
function compareValue(actual, op, expected) {
  switch(op || '==') {
    case '>=': return actual >= expected; case '<=': return actual <= expected;
    case '>': return actual > expected; case '<': return actual < expected;
    case '!=': return actual != expected; default: return actual == expected;
  }
}
function evaluateCondition(condition, ctx) {
  if (condition && typeof condition === 'object' && condition.ledgerCount) {
    const spec=condition.ledgerCount, actual=ledgerScopeEvents(ctx.state,spec,ctx).length;
    const ok=compareValue(actual,spec.op,spec.value);
    return {ok,matchedBranches:ok?['ledgerCount']:[],failedReasons:ok?[]:[`本展开事件 ${spec.type||'*'}：${actual}/${spec.value}`]};
  }
  if (condition && typeof condition === 'object' && condition.ledgerSum) {
    const spec=condition.ledgerSum, events=ledgerScopeEvents(ctx.state,spec,ctx);
    const actual=events.reduce((n,e)=>n+Number(e[spec.field]??e.payload?.[spec.field]??0),0);
    const ok=compareValue(actual,spec.op,spec.value);
    return {ok,matchedBranches:ok?['ledgerSum']:[],failedReasons:ok?[]:[`本展开 ${spec.type||'*'} ${spec.field}：${actual}/${spec.value}`]};
  }
  if (condition == null || condition === '') return { ok:true, matchedBranches:['empty'], failedReasons:[] };
  if (typeof condition === 'string') {
    const ok = checkLegacyCondition(condition, ctx);
    return { ok, matchedBranches: ok ? [condition] : [], failedReasons: ok ? [] : [condition] };
  }
  if (Array.isArray(condition)) {
    const parts=condition.map(c=>evaluateCondition(c,ctx));
    const ok=parts.every(x=>x.ok); return {ok,matchedBranches:parts.flatMap(x=>x.matchedBranches),failedReasons:parts.flatMap(x=>x.failedReasons)};
  }
  if (condition.all) {
    const parts=condition.all.map(c=>evaluateCondition(c,ctx));
    const ok=parts.every(x=>x.ok); return {ok,matchedBranches:parts.flatMap(x=>x.matchedBranches),failedReasons:parts.flatMap(x=>x.failedReasons)};
  }
  if (condition.any) {
    const parts=condition.any.map(c=>evaluateCondition(c,ctx));
    const ok=parts.some(x=>x.ok); return {ok,matchedBranches:parts.filter(x=>x.ok).flatMap(x=>x.matchedBranches),failedReasons:ok?[]:parts.flatMap(x=>x.failedReasons)};
  }
  if (condition.not) { const r=evaluateCondition(condition.not,ctx); return {ok:!r.ok,matchedBranches:!r.ok?['not']:[],failedReasons:!r.ok?[]:['not']}; }
  const {state,attacker,defender}=ctx; const atk=state.players[attacker], def=state.players[defender];
  let actual, label='condition';
  if (condition.targetStatus) { actual=hasStatus(def,condition.targetStatus)||getPosture(def)===condition.targetStatus; label=`targetStatus:${condition.targetStatus}`; return {ok:!!actual,matchedBranches:actual?[label]:[],failedReasons:actual?[]:[label]}; }
  if (condition.selfStatus) { actual=hasStatus(atk,condition.selfStatus)||getPosture(atk)===condition.selfStatus; label=`selfStatus:${condition.selfStatus}`; return {ok:!!actual,matchedBranches:actual?[label]:[],failedReasons:actual?[]:[label]}; }
  if (condition.ledger) { actual=v7LedgerValue(state, condition.side==='defender'?defender:attacker, condition.ledger); label=`ledger:${condition.ledger}`; const ok=compareValue(actual,condition.op,condition.value); return {ok,matchedBranches:ok?[label]:[],failedReasons:ok?[]:[`${label}=${actual}`]}; }
  if (condition.distance) { actual=dist(atk.pos,def.pos); const ok=compareValue(actual,condition.op,condition.value); return {ok,matchedBranches:ok?['distance']:[],failedReasons:ok?[]:[`distance=${actual}`]}; }
  return {ok:false,matchedBranches:[],failedReasons:['unknown condition']};
}


/**
 * 判定追击条件是否满足。
 * @param {string} condition CONDITION 键
 * @param {object} ctx { state, attacker, defender, card, lastLog }
 *   lastLog 为连击链上一击的 ResolutionLog（无则为 null）
 * @returns {boolean}
 */
function checkLegacyCondition(condition, ctx) {
  const { state, attacker, defender, card, lastLog } = ctx;
  const atk = state.players[attacker];
  const def = state.players[defender];
  const posture = getPosture(def);

  switch (condition) {
    case CONDITION.NONE:
      return true;
    case CONDITION.HIT:
      return !!lastLog && lastLog.finalDamage >= 0 && !lastLog.counteredBy;
    case CONDITION.HURT:
      return !!lastLog && lastLog.finalDamage > 0;
    case CONDITION.SELFHURT:
      return atk.hp < atk.hero.hp;
    case CONDITION.MELEE:
      return dist(atk.pos, def.pos) <= CONST.MELEE_RANGE;
    case CONDITION.ANY:
      return true;
    case CONDITION.WALL:
      return !!lastLog && (
        (lastLog.statusApplied || []).includes(INSTANT.WALL_HIT)
        || String(lastLog.note || '').includes('撞墙')
        || String(lastLog.note || '').includes('wall_hit')
      );
    case CONDITION.LOWHP:
      return def.hp <= def.hero.hp / 2;
    case CONDITION.AIR:
      return posture === POSTURE.AIRBORNE;
    case CONDITION.RANGE:
      return dist(atk.pos, def.pos) > CONST.MELEE_RANGE;
    case CONDITION.KNOCK:
      // 撞墙是击退被边界/障碍截停的结果，仍应满足“上一击击退”类追击。
      return !!peekInstant(def,INSTANT.KNOCKED)
        ||!!peekInstant(def,INSTANT.WALL_HIT)
        ||!!lastLog?.statusApplied?.some(x=>x===INSTANT.KNOCKED||x===INSTANT.WALL_HIT);
    case CONDITION.DOWN:
      return posture === POSTURE.DOWNED;
    case CONDITION.DASH:
      return !!card.dash;
    case CONDITION.STATUS:
      return def.statusSlots.control.length > 0
          || def.statusSlots.persistent.length > 0
          || posture !== POSTURE.NORMAL;
    case CONDITION.DASHSELF:
      return !!lastLog && lastLog.note.includes('位移');
    case CONDITION.AIRDOWN:
      return posture === POSTURE.AIRBORNE || posture === POSTURE.DOWNED;
    case CONDITION.FEATHER:
      return atk.hero.id === 'baiye' && (atk.mechanics.feathers || 0) >= 1;
    case CONDITION.FEATHER2:
      return atk.hero.id === 'baiye' && (atk.mechanics.feathers || 0) >= 2;
    case CONDITION.AWAKE:
      return atk.hero.id === 'baiye' && !!atk.mechanics.awakened;
    case CONDITION.FLY:
      return hasStatus(atk, PERSISTENT.FLYING);
    case CONDITION.MOVED:
      return !!expansionHistoryFact(state,attacker,'moved');
    case CONDITION.HEALED:
      return expansionHistoryFact(state,attacker,'healed') > 0;
    case CONDITION.QI4:
      return atk.qi >= 4;
    case CONDITION.QI3:
      return atk.qi >= 3;
    case CONDITION.SECOND:
      return v7LedgerValue(state,attacker,'activeCardsPlayed') + v7LedgerValue(state,attacker,'followCardsPlayed') + v7LedgerValue(state,attacker,'counterCardsPlayed') === 1;
    case CONDITION.LOWDECK:
      return atk.deck.length <= 3;
    default:
      throw new Error(`checkCondition: 未实现的追击条件 "${condition}"`);
  }
}


function checkCondition(condition, ctx) { return evaluateCondition(condition, ctx).ok; }

// ---------------------------------------------------------------------------
// 费用计算（追击减费 / 僵直税 / 折扣）
// ---------------------------------------------------------------------------

/**
 * 计算牌的实际费用。
 * @param {object} state
 * @param {number} side
 * @param {object} card
 * @param {boolean} isFollow 是否追击
 * @returns {number}
 */
function computeCost(state, side, card, isFollow = false) {
  const p = state.players[side];
  let cost = card.cost;

  // 追击减费：满足条件的攻击牌费用-1（最低0）。
  // 白夜觉醒后，成长收益落在连击动作数：合规追击额外再-1费。
  if (isFollow && card.type === 'attack' && card.condition) {
    const lastLog = state.chain[state.chain.length - 1] || null;
    const ok = checkCondition(card.condition, {
      state, attacker: side, defender: 1 - side, card, lastLog,
    });
    if (ok || p.mechanics.swiftDouble) {
      cost = Math.max(0, cost - 1);
      if (ok && p.hero.id === 'baiye' && p.mechanics.awakened) cost = Math.max(0, cost - 1);
    }
  }

  // 僵直税：下一次攻击牌费用+1
  if (card.type === 'attack' && hasStatus(p, CONTROL.STIFF)) {
    cost += 1;
  }

  // 岚羽永翔之魂：每大回合首次进飞行费用0（卡牌侧：带飞行效果的牌）。
  // 费用减免只是预览；额度消费统一在 enterFlying，未实际进飞行不消耗额度。
  if (p.hero.id === 'lanyu'
      && [EFFECT.FLY, EFFECT.FLY_DRAW, EFFECT.FLY_DRAW_QI].includes(card.effect)
      && lanyuFreeFlyAvailable(state, side)) {
    cost = 0;
  }

  // 拉封王室军令：每大回合首次反击费用-1
  if (card.type === 'counter' && p.hero.id === 'lafeng'
      && !p.mechanics.royalOrderUsedThisRound) {
    cost = Math.max(0, cost - 1);
  }
  // 拉封荣耀宣令 buff：下一张反击费用-1
  if (card.type === 'counter' && p.mechanics.lafengGloryArmed) {
    cost = Math.max(0, cost - 1);
  }
  // 玄医以守为攻：下一张反击费用-1
  if (card.type === 'counter' && p.mechanics.xuanyiDefArmed) {
    cost = Math.max(0, cost - 1);
  }
  // 白夜逆风展翼：下一张真正满足条件的追击再-1费。
  if (isFollow && card.type === 'attack' && card.condition && p.mechanics.baiyeWindArmed) {
    const lastLog = state.chain[state.chain.length - 1] || null;
    const ok = checkCondition(card.condition, {
      state, attacker: side, defender: 1 - side, card, lastLog,
    });
    if (ok) cost = Math.max(0, cost - 1);
  }
  if(isFollow&&card.type==='attack'&&card.condition==='selfhurt'&&p.mechanics.painExcited)cost=Math.max(0,cost-1);
  if(isFollow&&card.type==='attack'&&card.condition==='fly'&&p.mechanics.lanyuCryArmed)cost=Math.max(0,cost-1);
  if(!isFollow&&card.type==='attack'&&card.timing==='starter'&&p.mechanics.lafengRiposteReady)cost=Math.max(0,cost-1);
  if(!isFollow&&card.type==='attack'&&card.timing==='starter'&&p.mechanics.xuanyiHiddenNeedleReady)cost=Math.max(0,cost-1);
  // 游影无影境：每展开第一张移动牌费用0
  if (card.type === 'move' && p.hero.id === 'youying' && !p.mechanics.shadowlessMoveUsed) {
    cost = 0;
  }
  // discount：下一张牌费用-1
  if (p.mechanics.discountNext > 0) {
    cost = Math.max(0, cost - 1);
  }
  return cost;
}

/** 支付费用（含消费僵直/折扣/军令标记）。 */
function payCost(state, side, card, cost) {
  const p = state.players[side];
  if (p.energy < cost) throw new Error(`能量不足：需 ${cost}，现有 ${p.energy}`);
  p.energy -= cost;
  if (card.type === 'counter' && p.hero.id === 'lafeng'
      && !p.mechanics.royalOrderUsedThisRound) {
    p.mechanics.royalOrderUsedThisRound = true;
  }
  // 反击增益在 DAMAGE 阶段消费；PAY 只扣费，不能提前清掉伤害标记。
  if (card.type === 'move' && p.hero.id === 'youying' && !p.mechanics.shadowlessMoveUsed) {
    p.mechanics.shadowlessMoveUsed = true;
  }
  if (p.mechanics.discountNext > 0) p.mechanics.discountNext -= 1;
}

// ---------------------------------------------------------------------------
// 10 步结算管线
// ---------------------------------------------------------------------------

/**
 * 结算一张牌。直接修改传入的 state（调用方负责事务）。
 * @param {object} state
 * @param {number} attackerSide
 * @param {object} card 牌对象（含 name/cost/type/timing/damage/condition/effect/range）
 * @param {object} [opts] { isFollow, isCounter, target }
 * @returns {object} ResolutionLog
 */
function resolveCard(state, attackerSide, card, opts = {}) {
  const defenderSide = 1 - attackerSide;
  const atk = state.players[attackerSide];
  const def = state.players[defenderSide];
  const stepNum = state.chain.filter((entry) => !entry.cardType || entry.cardType === 'attack').length + 1;
  const log = makeResolutionLog(card.name, stepNum);
  log.cardType = card.type;
  const isFollow = !!opts.isFollow;
  ensureExpansion(state, attackerSide);
  const modeSpec = card.modes ? (isFollow ? card.modes.follow : card.modes.active) : null;
  const effectiveCondition = modeSpec?.condition ?? card.condition;

  // 1. DECLARE —— 宣告
  state.phase=PHASE.CARD_DECLARED;
  const previousLog=state.chain[state.chain.length-1]||null;
  const previousCard=previousLog?atk.hero.cards.find(c=>c.name===previousLog.cardName||c.artKey===previousLog.cardName):null;
  // 追击条件属于“上一击留下的事实”。追步只负责桥接距离，
  // 不能因攻击者位置改变而重新解释上一击是否撞墙/击退等条件。
  const conditionBeforePreMove=isFollow&&effectiveCondition
    ?checkCondition(effectiveCondition,{state,attacker:attackerSide,defender:defenderSide,card,lastLog:previousLog})
    :null;
  let preMove=0;
  const rangeBeforePreMove=effectiveRange(state,attackerSide,card);
  const needsBridge=dist(atk.pos,def.pos)>rangeBeforePreMove;
  if(needsBridge){
    if(isFollow&&atk.mechanics.followStepAvailable>0){
      preMove=Math.max(preMove,atk.mechanics.followStepAvailable);
      atk.mechanics.followStepAvailable=0;
    }
    if(card.preMoveToward)preMove=Math.max(preMove,card.preMoveToward);
    if(card.preMoveIfLastRanged&&previousCard&&(previousCard.range||0)>CONST.MELEE_RANGE)preMove=Math.max(preMove,card.preMoveIfLastRanged);
    if(card.preMoveIfHealed&&expansionHistoryFact(state,attackerSide,'healed')>0)preMove=Math.max(preMove,card.preMoveIfHealed);
    if(card.timing==='starter'&&atk.mechanics.lafengRiposteReady)preMove=Math.max(preMove,1);
  }
  if(preMove>0){
    const before={...atk.pos};
    moveTowardWithinBudget({state,attacker:attackerSide,defender:defenderSide,log,card},preMove);
    if(before.r!==atk.pos.r||before.c!==atk.pos.c)log.note+=`追步${preMove};`;
  }
  // 2. VALIDATE —— 校验
  if (state.winner != null) throw new Error('对局已结束');
  let consumeSwiftDouble = false;
  if (card.type === 'attack') {
    if (!isFollow && ruleInitiativeSide(state) !== attackerSide) throw new Error('无进攻权');
    if (v7LedgerValue(state,attackerSide,'attacksResolved') >= CONST.MAX_ATTACKS) {
      throw new Error(`本展开攻击已达 ${CONST.MAX_ATTACKS} 次上限`);
    }
    if (isFollow && state.chain.length >= CONST.MAX_FOLLOW + 1) {
      throw new Error(`追击已达 ${CONST.MAX_FOLLOW} 次上限`);
    }
    const d = dist(atk.pos, def.pos);
    const range = effectiveRange(state, attackerSide, card);
    if (d > range) throw new Error(`距离不足：相距 ${d}，牌程 ${range}`);
    // 追击条件校验。疾影二段的忽略条件标记必须在费用计算完成后再消费，
    // 否则合法列表按0费显示，执行时却会重新收取1费。
    if (isFollow && effectiveCondition) {
      const lastLog = state.chain[state.chain.length - 1] || null;
      const conditionMet=conditionBeforePreMove!==null
        ?conditionBeforePreMove
        :checkCondition(effectiveCondition,{state,attacker:attackerSide,defender:defenderSide,card,lastLog});
      if(!conditionMet&&!atk.mechanics.swiftDouble&&!atk.mechanics.lafengSeizeFollow){
        throw new Error(`追击条件不满足：${JSON.stringify(effectiveCondition)}`);
      }
      consumeSwiftDouble=!conditionMet&&atk.mechanics.swiftDouble;if(!conditionMet&&atk.mechanics.lafengSeizeFollow)atk.mechanics.lafengSeizeFollow=false;
    }
  }
  const cost = computeCost(state, attackerSide, card, isFollow);
  if (consumeSwiftDouble) atk.mechanics.swiftDouble = false;

  // 3. PAY —— 支付
  payCost(state, attackerSide, card, cost);
  // 牌从手牌→结算区（调用方应已把牌从 hand 移除；此处防御性处理）
  const handIdx = atk.hand.findIndex((c) => c === card || c.name === card.name);
  if (handIdx >= 0) atk.hand.splice(handIdx, 1);
  atk.discard.push(card);

  // 4. RESPONSE —— V7 冻结契约：所有非绝技攻击（含普通追击）均进入响应窗口。
  // 角色签名收益在响应事务真正完成后统一由 continueResolution 结算，
  // 不再通过“取消普通追击响应”绕开事务边界。
  const lafengDefender = state.players[defenderSide];
  const openResponse = card.type === 'attack' && !opts.isUltimate;
  const stiffBlocksCounter = openResponse && hasStatus(lafengDefender, CONTROL.STIFF);
  if (openResponse) {
    state.phase = PHASE.RESPONSE_WINDOW;
    // 草丛：攻击者站草丛且本展开首击（bushFirstHitUsed 未置）→ 该击不可被普通反击，
    // 攻击后暴露（置 bushFirstHitUsed，后续攻击可正常被反击）。
    const onBush = card.type === 'attack'
      && !atk.mechanics.bushFirstHitUsed
      && cellTerrain(state, atk.pos.r, atk.pos.c) === 'bush';
    // 把已完成的 DECLARE/VALIDATE/PAY 结果（cost、log）连同 card 存进 pendingCard，
    // passResponse 从此恢复上下文继续结算，不重复支付
    state.pendingCard = { card, attackerSide, log, cost, opts, bushUncounterable: onBush, stiffBlocksCounter, consumeStiffOnResolve: stiffBlocksCounter };
    state.expansion.pendingAttack = state.pendingCard;
    state.expansion.responseCount += 1;
    if (stiffBlocksCounter) {
      log.note += '僵直生效：本次反击牌窗口被压制；僵直将在攻击结算时消耗;';
      emitV7Event(state, {
        type: 'REACTION_WINDOW_SUPPRESSED',
        actorId: defenderSide,
        targetSide: defenderSide,
        sourceCardId: card.id || card.name,
        payload: { reason: 'stiff', counterCardsBlocked: true, struggleStillAllowed: true }
      });
    } else {
      emitV7Event(state, {
        type: 'RESPONSE_WINDOW_OPENED',
        actorId: defenderSide,
        targetSide: defenderSide,
        sourceCardId: card.id || card.name,
        payload: { counterCardsAllowed: !onBush, struggleAllowed: true, bushUncounterable: onBush }
      });
    }
    if (onBush) atk.mechanics.bushFirstHitUsed = true;
    return log; // 挂起，等待 counter/struggle/passResponse
  }

  return continueResolution(state, attackerSide, card, log, opts);
}

/**
 * 续行结算：RESPONSE 之后的剩余管线（RESOLUTION→...→OPEN_CHASE）。
 * 由 resolveCard（无响应窗口时直接调用）或 passResponse（恢复挂起牌）调用。
 * 前提：DECLARE/VALIDATE/PAY 已完成，cost 已支付，log 已建。
 * @param {object} state
 * @param {number} attackerSide
 * @param {object} card
 * @param {object} log 已含 step/baseDamage 初始值的 ResolutionLog
 * @param {object} [opts] { isFollow, isCounter, isUltimate }
 * @returns {object} ResolutionLog
 */
function isSuccessfulCounterResolution(card, finalDamage) {
  if (!card || card.type !== 'counter') return false;
  if (finalDamage > 0) return true;
  return card.counterSuccess === true;
}

function continueResolution(state, attackerSide, card, log, opts = {}) {
  const defenderSide = 1 - attackerSide;
  const atk = state.players[attackerSide];
  const def = state.players[defenderSide];
  const stepNum = log.step;
  const isFollow = !!opts.isFollow;
  // 当前攻击尚未写入 ATTACK_RESOLVED；因此该值就是“本方此前已结算攻击数”。
  const priorAttackCount = v7LedgerValue(state, attackerSide, 'attacksResolved');
  const currentAttackOrdinal = card.type === 'attack' ? priorAttackCount + 1 : priorAttackCount;

  // 若被反击/挣脱终止，直接返回
  if (log.counteredBy) {
    state.chain.push(log);
    return log;
  }

  state.phase = PHASE.RESOLUTION;
  if (opts.consumeStiffOnResolve || state.pendingCard?.consumeStiffOnResolve) {
    const consumed = removeStatus(state, defenderSide, CONTROL.STIFF);
    if (consumed) {
      log.note += '僵直已消耗;';
      emitV7Event(state, {
        type: 'STATUS_CONSUMED',
        actorId: defenderSide,
        targetSide: defenderSide,
        sourceCardId: card.id || card.name,
        payload: { status: CONTROL.STIFF, reason: 'blocked_counter_window' }
      });
    }
  }

  // 5. MITIGATE —— 减伤（护盾在 damage() 内处理；僵直税已在 PAY 处理）
  //    闪避类效果在 APPLY_STATUS 由效果函数处理

  // 6. DAMAGE —— 伤害：基础 + 加成 - 衰减
  let base = card.damage || 0;
  log.baseDamage = base;
  let bonus = 0;

  // 角色机制加成
  if (card.type === 'attack' || card.type === 'counter') {
    // 洛基冠军怒吼/逆境心脏
    if (atk.mechanics.luojiRoarBuff > 0) {
      bonus += atk.mechanics.luojiRoarBuff;
      log.bonuses.push({ source: 'luoji_roar', amount: atk.mechanics.luojiRoarBuff });
      atk.mechanics.luojiRoarBuff = 0;
    }
    // 洛基冠军回合：前三次攻击+1
    if (atk.mechanics.championRoundLeft > 0) {
      bonus += 1;
      log.bonuses.push({ source: 'champ_round', amount: 1 });
      atk.mechanics.championRoundLeft -= 1;
    }
    // 赤羽战意叠加：本展开第2次攻击+3（R7 Pass3: +2→+3，赤羽vs白夜20%最重失衡，需补爆发）
    if (atk.hero.id === 'chiyu'
        && priorAttackCount === 1
        && !atk.mechanics.secondAttackBuffed) {
      bonus += 3;
      log.bonuses.push({ source: 'war_spirit', amount: 3 });
      atk.mechanics.secondAttackBuffed = true;
    }
    // 赤羽血祭图腾：本展开攻击+1
    if (atk.mechanics.bloodTotem) {
      bonus += 1;
      log.bonuses.push({ source: 'blood_totem', amount: 1 });
    }
    // 赤羽先民围猎：对目标+1
    if (atk.mechanics.ancestralHuntOn === defenderSide) {
      bonus += 1;
      log.bonuses.push({ source: 'ancestral_hunt', amount: 1 });
    }
    // 拉封优雅收势：V6 R7 平衡 — 移除无条件首击+1（拉封过强为机制驱动，卡面小削无效；
    // 保留"只用1张攻击则收势移动1"的身份，仅削爆发不开全局压制）
    // if (atk.hero.id === 'lafeng' && priorAttackCount === 0) {
    //   bonus += 1;
    //   log.bonuses.push({ source: 'graceful_end', amount: 1 });
    // }
    // 拉封决斗宣誓：本展开若只攻击1次，该攻击+2（V6 R6：+3→+2，首击爆发7→6）
    if (atk.mechanics.duelOath && priorAttackCount === 0) {
      bonus += 2;
      log.bonuses.push({ source: 'duel_oath', amount: 2 });
    }
    // 高地：站高打低，本展开首击+1伤（TERRAIN_RULE.highland.meleeFirstHitBonus）。
    // 仅攻击牌、攻击者站高地、目标不在高地、且本展开首击未结算时生效。
    if (card.type === 'attack'
        && !atk.mechanics.highlandFirstHitUsed
        && cellTerrain(state, atk.pos.r, atk.pos.c) === 'highland'
        && cellTerrain(state, def.pos.r, def.pos.c) !== 'highland') {
      bonus += 1;
      log.bonuses.push({ source: 'highland', amount: 1 });
      atk.mechanics.highlandFirstHitUsed = true;
    }
    // 拉封荣耀宣令：反击伤害+1
    if (card.type === 'counter' && (atk.mechanics.gloryCall || atk.mechanics.lafengGloryArmed)) {
      bonus += 1;
      log.bonuses.push({ source: 'glory_call', amount: 1 });
      atk.mechanics.gloryCall = false;
      atk.mechanics.lafengGloryArmed = false;
    }
    // 囚徒完全过载：本展开第2、3次攻击各+1。
    if (atk.mechanics.fullOverload
        && (priorAttackCount === 1 || priorAttackCount === 2)) {
      bonus += 1;
      log.bonuses.push({ source: 'full_overload', amount: 1 });
    }
    // 囚徒常驻过载：本展开第3张攻击+1；自损在该攻击完整结算后触发。
    if (card.type === 'attack' && atk.hero.id === 'qiu013'
        && priorAttackCount === 2
        && !atk.mechanics.qiuOverloadTriggeredThisExpansion) {
      bonus += 1;
      log.bonuses.push({ source: 'overload', amount: 1 });
    }
    // 囚徒荷尔蒙潮汐：下一张攻击+2，结算后自损1。
    if (atk.mechanics.qiuHormoneArmed) {
      bonus += 2;
      log.bonuses.push({ source: 'hormone_tide', amount: 2 });
    }
    // 白夜湖上独舞：本展开每次移动令下一击+1，攻击时一次性消费累积。
    if (atk.mechanics.lakeDanceCharges > 0) {
      bonus += atk.mechanics.lakeDanceCharges;
      log.bonuses.push({ source: 'lake_dance', amount: atk.mechanics.lakeDanceCharges });
      atk.mechanics.lakeDanceCharges = 0;
    }
    // 白夜水面借力：强化移动完成后，下一击+1。
    if (atk.hero.id === 'baiye' && atk.mechanics.baiyeWaterDamageArmed) {
      bonus += 1;
      log.bonuses.push({ source: 'baiye_water', amount: 1 });
      atk.mechanics.baiyeWaterDamageArmed = false;
    }
    // 白夜觉醒：对异常目标+1伤。异常统一读取姿态、控制和持续伤害状态。
    if (atk.hero.id === 'baiye' && atk.mechanics.awakened) {
      const abnormal = getPosture(def) !== POSTURE.NORMAL
        || def.statusSlots.control.length > 0
        || def.statusSlots.persistent.some((s) => [PERSISTENT.BURN, PERSISTENT.POISON, PERSISTENT.FROZEN].includes(s.id));
      if (abnormal) {
        bonus += 1;
        log.bonuses.push({ source: 'baiye_awaken', amount: 1 });
      }
    }
    // 游影借势/无影境：本展开移动后下一击+1；每展开最多触发2次，与游步次数对齐。
    if (atk.hero.id === 'youying' && atk.mechanics.momentumArmed) {
      if (atk.mechanics.momentumUsedThisExpansion < 2) {
        bonus += 1;
        log.bonuses.push({ source: 'momentum', amount: 1 });
        atk.mechanics.momentumUsedThisExpansion += 1;
      }
      atk.mechanics.momentumArmed = false;
    }
    // 玄医以守为攻：下一张反击伤害+1。
    if (card.type === 'counter' && atk.mechanics.xuanyiDefArmed) {
      bonus += 1;
      log.bonuses.push({ source: 'defense_offense', amount: 1 });
      atk.mechanics.xuanyiDefArmed = false;
    }
    if(card.chainThirdBonus&&stepNum===3){bonus+=card.chainThirdBonus;log.bonuses.push({source:'chain_third_bonus',amount:card.chainThirdBonus})}
    // 岚羽核心机制：飞行中本展开第一次攻击触发俯冲+3。
    // 旧版只写在角色数据中未程序化，导致“飞行机动”只有免击退，没有伤害闭环。
    if (atk.hero.id === 'lanyu'
        && hasStatus(atk, PERSISTENT.FLYING)
        && priorAttackCount === 0
        && !atk.mechanics.diveUsed) {
      bonus += 3;
      log.bonuses.push({ source: 'dive', amount: 3 });
      atk.mechanics.diveUsed = true;
    }
    // 苍穹猎道：本展开飞行攻击+1；持续整个展开。
    if (atk.hero.id === 'lanyu' && hasStatus(atk, PERSISTENT.FLYING) && atk.mechanics.skyHunt) {
      bonus += 1;
      log.bonuses.push({ source: 'sky_hunt', amount: 1 });
    }
  }

  // 伤害衰减：第4击-1、第5击-2，最低1伤
  let decay = 0;
  if (card.type === 'attack') {
    if (stepNum === 4) decay = CONST.DECAY_4TH;
    else if (stepNum === 5) decay = CONST.DECAY_5TH;
  }
  log.decay = decay;

  let final = base + bonus - decay;
  if ((card.type === 'attack' || card.type === 'counter') && base > 0) final = Math.max(1, final);
  else final = Math.max(0, final);
  log.finalDamage = final;

  if (final > 0 && (card.type === 'attack' || card.type === 'counter')) {
    damage(state, defenderSide, final, card.name);
  }

  // 主动恢复牌的治疗量来自 card.damage；该字段是治疗量，不进入伤害统计。
  // 追击攻击上的 heal 效果仍由 EFFECT_REGISTRY 处理固定治疗，避免重复治疗。
  if (card.type === 'heal') {
    const restored = heal(state, attackerSide, card.damage || 0);
    log.healing = restored;
    if (atk.hero.id === 'xuanyi') atk.mechanics.activeHealUsedThisExpansion = true;
    log.note += `治疗${restored};`;
  }

  // 7. APPLY_STATUS —— 施状态（效果注册表）
  const effectKey = card.effect || EFFECT.NONE;
  const handler = EFFECT_REGISTRY[effectKey];
  if (!handler) {
    throw new Error(`效果未注册：${card.name} effect="${effectKey}"`);
  }
  const ctx = {
    state, attacker: attackerSide, defender: defenderSide, card, log, opts,
    engine: ENGINE_HELPERS,
  };
  handler(ctx);

  // 8. MECHANIC —— 机制：资源/抽牌/计数
  if (card.type === 'attack') {
    // V6 R2 平滑气经济：每次命中+1气（基础），第3/5击额外+1（连击加成）
    if (final > 0) gainQi(state, attackerSide, CONST.QI_ON_HIT, { combat: true });
    if (stepNum === 3) gainQi(state, attackerSide, CONST.QI_ON_3RD_HIT, { combat: true });
    if (stepNum === 5) gainQi(state, attackerSide, CONST.QI_ON_5TH_HIT, { combat: true });
    if (atk.mechanics.qiuHormoneArmed) {
      damage(state, attackerSide, 1, 'hormone_tide', { isSelf: true });
      atk.mechanics.qiuHormoneArmed = false;
      log.note += '荷尔蒙潮汐自损1;';
    }
    if (atk.hero.id === 'qiu013'
        && currentAttackOrdinal === 3
        && !atk.mechanics.qiuOverloadTriggeredThisExpansion) {
      atk.mechanics.qiuOverloadTriggeredThisExpansion = true;
      damage(state, attackerSide, 1, 'overload', { isSelf: true });
      log.note += '过载自损1;';
    }
    if(atk.hero.id==='youying'&&atk.mechanics.wanderMovesUsed<2&&Array.isArray(opts.wanderPath)&&opts.wanderPath.length){
      try{
        const moved=applySelectedMovePath(state,attackerSide,opts.wanderPath,atk.mechanics.flowBreak?2:1);
        if(moved.moved){
          atk.mechanics.wanderMovesUsed+=1;finalizeMoveMechanics(state,attackerSide,moved.origin);log.note+=`游步${moved.spent};`;
          if(atk.mechanics.flowBreak&&!atk.mechanics.flowBreakCycled){cycleCard(state,attackerSide,1);atk.mechanics.flowBreakCycled=true}
        }
      }catch(_wanderError){
        // 游步是可选后续。响应/攻击结算改变占位后，原预选路径可能失效；
        // 此时只放弃游步，不让整张攻击牌回滚或卡死。
        log.note+='预选游步落点失效，未移动;';
      }
    }
    if(card.refundEnergyAtChainStep===stepNum&&!atk.mechanics.luojiSecondRefundUsed&&final>0){atk.energy=Math.min(CONST.ENERGY_MAX,atk.energy+(card.refundEnergyAmount||1));atk.mechanics.luojiSecondRefundUsed=true;log.note+='连打返还1能;'}
    if(card.consumeTacticalStep)atk.mechanics.tacticalStepUsed=true;
    if(card.markFateLine&&final>0){def.mechanics.fateLineFrom=attackerSide;log.note+='施加命线;'}
    if(card.consumeFateLine&&def.mechanics.fateLineFrom===attackerSide){def.mechanics.fateLineFrom=null;log.note+='消耗命线;'}
    if(card.condition==='selfhurt'&&atk.mechanics.painExcited)atk.mechanics.painExcited=false;
    if(card.timing==='starter'&&atk.mechanics.lafengRiposteReady){atk.mechanics.lafengRiposteReady=false;log.note+='荣耀回刺兑现;'}
    if(card.timing==='starter'&&atk.mechanics.xuanyiHiddenNeedleReady){atk.mechanics.xuanyiHiddenNeedleReady=false;log.note+='守中藏针兑现;'}
    if(card.condition==='fly'&&atk.mechanics.lanyuCryArmed){atk.mechanics.lanyuCryArmed=false;log.note+='天际鸣啸兑现;'}
    // 洛基连打节奏：本展开第4张攻击摸1
    if (atk.hero.id === 'luoji'
        && currentAttackOrdinal === 4
        && !atk.mechanics.fourthAttackDrawn) {
      atk.mechanics.fourthAttackDrawn = true;
      drawCards(state, attackerSide, 1);
    }
  }

  // 非攻击牌同样可以带有行动额度消费元数据。
  if(card.consumeTacticalStep)atk.mechanics.tacticalStepUsed=true;
  // 拉封决斗反击：每大回合首次反击命中后摸1。
  // 反击牌不是 attack，必须在攻击专属分支外结算，否则该常驻机制永远不可达。
  if (card.type === 'counter' && atk.hero.id === 'lafeng'
      && !atk.mechanics.firstCounterThisRound && final > 0) {
    atk.mechanics.firstCounterThisRound = true;
    drawCards(state, attackerSide, 1);
  }
  const counterSucceeded = isSuccessfulCounterResolution(card, final);
  if(counterSucceeded){
    emitV7Event(state,{type:'COUNTER_SUCCEEDED',actorId:attackerSide,side:attackerSide,targetSide:defenderSide,sourceCardId:card.instanceId||card.id||card.name,payload:{cardName:card.name,finalDamage:final}});
    if(atk.mechanics.lafengRiposteArmed){atk.mechanics.lafengRiposteArmed=false;atk.mechanics.lafengRiposteReady=true;log.note+='荣耀回刺就绪;'}
    if(atk.mechanics.xuanyiHiddenNeedleArmed){atk.mechanics.xuanyiHiddenNeedleArmed=false;atk.mechanics.xuanyiHiddenNeedleReady=true;log.note+='守中藏针就绪;'}
    if(card.grantSeizeOnCounter){atk.mechanics.lafengSeize=true;log.note+='夺权已标记;'}
  }

  // 9. CHECK_KO —— 击倒检查
  if (def.hp <= 0) {
    state.winner = attackerSide;
    state.phase = PHASE.GAME_OVER;
    log.note += '击倒;';
  }

  // 10. OPEN_CHASE —— 命中则开追击窗口
  if (state.winner == null && card.type === 'attack' && !state.chainTerminated) {
    // 记录本击满足的追击条件（供下一击参考）
    if (getPosture(def) === POSTURE.AIRBORNE) log.chaseConditionMet = CONDITION.AIR;
    else if (getPosture(def) === POSTURE.DOWNED) log.chaseConditionMet = CONDITION.DOWN;
    else if (peekInstant(def, INSTANT.KNOCKED)) log.chaseConditionMet = CONDITION.KNOCK;
    else if (final > 0) log.chaseConditionMet = CONDITION.HIT;
    state.phase = PHASE.CHASE_WINDOW;
  } else if (state.chainTerminated) {
    log.note += '连击被终止;';
    state.phase = PHASE.PRE_ATTACK;
  } else if (state.winner == null) {
    // 非攻击牌结算后仍处于当前展开的攻击前行动时点。
    state.phase = PHASE.PRE_ATTACK;
  }

  state.chain.push(log);
  emitV7Event(state, { type:'CARD_PLAYED', side:attackerSide, mode: card.type==='counter'?'counter':(isFollow?'follow':'active'), card:card.name });
  if (card.type === 'attack') emitV7Event(state, { type:'ATTACK_RESOLVED', side:attackerSide, card:card.name });
  emitV7Event(state, { type:'DAMAGE_RESOLVED', sourceSide:attackerSide, targetSide:defenderSide, declared:log.baseDamage||0, hpLost:log.finalDamage||0, shieldAbsorbed:0, isSelf:false, isReflect:false });
  state.log.push({ type: 'resolve', side: attackerSide, log });
  return log;
}

// ---------------------------------------------------------------------------
// 展开结束整备管线（设计01 §5）
// ---------------------------------------------------------------------------

/**
 * 展开结束整备：机制→资源点→危险区/持续伤害→补牌→清临时状态→转移进攻权→计数。
 * @param {object} state
 * @param {object} [context] { voluntary:boolean, reason:string }
 */
function expansionEndPipeline(state, context = {}) {
  const activeSide = ruleInitiativeSide(state);
  const active = state.players[activeSide];
  const other = state.players[1 - activeSide];
  const voluntary = context.voluntary === true;
  const endReason = context.reason || (voluntary ? 'voluntary' : 'forced');
  state.phase = PHASE.EXPANSION_END;

  // 1. 角色机制（收势触发）
  // “主动收势”必须由公开 endExpansion 明确传入，反击夺权和终结技自动收势不触发。
  // 囚徒抑制崩坏：每大回合1次，主动空收势，回2生命并摸1。
  // 限次理由（R4 诊断）：不限次时"不攻击纯收势"每展开回2，憋尿拖超时成为最优解——
  // 奖励不作为的机制必然被最优化成不作为。每大回合1次保留"没法打就休息"的战术选项，
  // 同时砍掉拖时间收益（21展开×2 → 每大回合2）。
  if (voluntary && active.hero.id === 'qiu013' && v7LedgerValue(state,activeSide,'attacksResolved') === 0
      && !active.mechanics.qiuSuppressBreakUsedThisRound) {
    active.mechanics.qiuSuppressBreakUsedThisRound = true;
    const restored = heal(state, activeSide, 2);
    const drawn = drawCards(state, activeSide, 1).length;
    state.log.push({ type: 'mechanic', side: activeSide, mechanic: 'suppress_break', restored, drawn, reason: endReason });
  }
  // 玄医养气：主动收势时本展开未承受敌方伤害且未用主动恢复牌，回1。
  // R7 Pass3：回2→回1。补给通胀移除后养气2在无伤守展开中过于稳定（每展开+2），
  // 对半砍后仍是防守奖励但不形成无法逾越的续航壁垒。
  if (voluntary && active.hero.id === 'xuanyi'
      && v7LedgerValue(state,activeSide,'hpLost') === 0
      && !active.mechanics.activeHealUsedThisExpansion) {
    heal(state, activeSide, 1);
  }
  // 拉封谢幕之礼：若本展开只攻击1次，回3并得1气
  if (active.mechanics.curtainCall && v7LedgerValue(state,activeSide,'attacksResolved') === 1) {
    heal(state, activeSide, 3);
    gainQi(state, activeSide, 1, { combat: false });
  }
  // 拉封优雅收势：本展开只用1张攻击，收势时向对手移动1 + 回1血。
  // R7 Pass 3 恢复：补给点通胀移除后拉封缺续航，回1血是轻杠杆——
  // 不给伤害（不回头部首击+1，那是最重杠杆），保留"少打一张换机动+续航"的决策。
  if (active.hero.id === 'lafeng' && v7LedgerValue(state,activeSide,'attacksResolved') === 1) {
    const restored = heal(state, activeSide, 1);
    const from = { ...active.pos };
    moveToward({ state, attacker: activeSide, defender: 1 - activeSide }, 1);
    state.log.push({
      type: 'mechanic', side: activeSide, mechanic: 'graceful_end',
      restored, from, to: { ...active.pos }, reason: endReason,
    });
  }
  if (active.mechanics.fullOverload && v7LedgerValue(state,activeSide,'attacksResolved') > 0) {
    damage(state, activeSide, 1, 'full_overload', { isSelf: true });
  }
  if(active.mechanics.greatCycle){if(v7LedgerValue(state,activeSide,'attacksResolved')>=2){heal(state,activeSide,2);gainQi(state,activeSide,1,{combat:false})}else heal(state,activeSide,1)}

  // 2. 资源点/补给点结算
  // 中央资源点：连续占据大回合给分级奖励（气/能/摸牌）。离开资源点清零连占。
  const rp = state.board.resource;
  if (active.pos.r === rp.r && active.pos.c === rp.c) {
    active.mechanics.resourceStreak = (active.mechanics.resourceStreak || 0) + 1;
    const tier = engineResourceTier(active.mechanics.resourceStreak);
    gainQi(state, activeSide, tier.qi, { combat: false });
    active.energy = Math.min(CONST.ENERGY_MAX, active.energy + tier.energy);
    if (tier.draw > 0) drawCards(state, activeSide, tier.draw);
    state.log.push({
      type: 'resource', side: activeSide, streak: active.mechanics.resourceStreak,
      qi: tier.qi, energy: tier.energy, draw: tier.draw,
    });
  } else {
    active.mechanics.resourceStreak = 0;
  }
  // 补给点：落地暂停管线，等待玩家四选一（heal/energy/draw/shield）。
  // 交互窗口由 resolveSupplyChoice 承接，选择后调用 _finishExpansion 完成余下管线。
  const sp = state.board.supplyRotation[state.supplyIndex % state.board.supplyRotation.length];
  if (active.pos.r === sp.r && active.pos.c === sp.c) {
    state.phase = PHASE.SUPPLY_CHOICE;
    return; // 暂停，等待 resolveSupplyChoice
  }
  _finishExpansion(state, activeSide);
}

/**
 * 展开结束管线后半段：补给点触发后的剩余步骤。
 * 从 resolveSupplyChoice 复用，避免与 expansionEndPipeline 重复。
 * @param {Object} state
 * @param {number} activeSide
 */
function _finishExpansion(state, activeSide) {
  const active = state.players[activeSide];
  // ---- 危险区 + 持续伤害 ----
  // 缩域封锁区：站在封锁格受1伤
  const cell=state.board.cells[active.pos.r][active.pos.c];
  if(cell.danger||!cell.zone){const amount=state.section>=5?2:1;damage(state,activeSide,amount,'danger_zone');state.log.push({type:'danger_zone',side:activeSide,amount});}
  // 灼烧：自己展开结束受1伤，计数-1
  const burn = getStatus(active, PERSISTENT.BURN);
  if (burn) {
    damage(state, activeSide, burn.stacks, 'burn');
    burn.remainingTriggers = (burn.remainingTriggers ?? 2) - 1;
    if (burn.remainingTriggers <= 0) removeStatus(state, activeSide, PERSISTENT.BURN);
  }

  // 4. 手牌补到5（V6 均衡：无反击且无起手攻击时整备换手，每大回合1次）
  drawCards(state, activeSide, Math.max(0, CONST.HAND_LIMIT - active.hand.length));
  const hasCounter = active.hand.some((c) => c.type === 'counter');
  const hasStarter = active.hand.some((c) => c.type === 'attack' && c.timing === 'starter');
  if (!hasCounter && !hasStarter && !active.mechanics.handRedrawUsedThisRound) {
    // 整备换手：弃全部手牌，摸等量
    const n = active.hand.length;
    active.discard.push(...active.hand);
    active.hand = [];
    drawCards(state, activeSide, n);
    active.mechanics.handRedrawUsedThisRound = true;
    state.log.push({ type: 'hand_redraw', side: activeSide, count: n });
  }

  // 5. 清临时状态
  clearExpired(state, activeSide, PHASE.EXPANSION_END);
  // 重置本展开机制标志
  active.mechanics.knockAdvanceUsed = false;
  active.mechanics.secondAttackBuffed = false;
  active.mechanics.fourthAttackDrawn = false;
  active.mechanics.championRoundLeft = 0;
  active.mechanics.cornerStorm = false;
  active.mechanics.sunDance = false;
  active.mechanics.bloodTotem = false;
  active.mechanics.ancestralHuntOn = null;
  active.mechanics.duelOath = false;
  active.mechanics.gloryCall = false;
  active.mechanics.curtainCall = false;
  active.mechanics.luojiRoarBuff = 0;
  active.mechanics.chiyuHornArmed = false;
  active.mechanics.lafengGloryArmed = false;
  active.mechanics.energyDrainThisExpansion = 0;
  active.mechanics.tacticalStepUsed = false;
  active.mechanics.discountNext = 0;
  active.mechanics.diveUsed = false;
  active.mechanics.skyHunt = false;
  active.mechanics.lanyuCryArmed = false;
  active.mechanics.fullOverload = false;
  active.mechanics.qiuHormoneArmed = false;
  active.mechanics.qiuOverloadTriggeredThisExpansion = false;
  active.mechanics.lakeDance = false;
  active.mechanics.lakeDanceCharges = 0;
  active.mechanics.baiyeWaterMoveArmed = false;
  active.mechanics.baiyeWaterDamageArmed = false;
  active.mechanics.baiyeWindArmed = false;
  active.mechanics.flowBreak = false;
  active.mechanics.flowBreakCycled = false;
  active.mechanics.swiftDouble = false;
  active.mechanics.wanderMovesUsed = 0;
  active.mechanics.momentumArmed = false;
  active.mechanics.momentumUsedThisExpansion = 0;
  active.mechanics.shadowlessMoveUsed = false;
  active.mechanics.greatCycle = false;
  // 地形机制标志（每展开重置）：高地首击 / 草丛暴露
  active.mechanics.highlandFirstHitUsed = false;
  active.mechanics.bushFirstHitUsed = false;
  // 以守为攻必须跨到对手展开的响应窗口，不能在自己收势时清除。
  active.mechanics.activeHealUsedThisExpansion = false;
  active.mechanics.followStepAvailable=0;
  active.mechanics.luojiSecondRefundUsed=false;
  active.mechanics.painRoarUsed=false;
  active.mechanics.painExcited=false;
  active.mechanics.lafengRiposteReady=false;
  active.mechanics.lafengSeizeFollow=false;
  active.mechanics.xuanyiHiddenNeedleReady=false;
  state.players[1-activeSide].mechanics.fateLineFrom=null;

  // 6. 转移下一展开的进攻权，并同步 V7 主动权镜像。
  // 反击可在展开内临时改变 initiativeSide/turn；收势后必须以交换后的新展开方
  // 重建主动权，否则会出现 turn 已切换、initiativeSide 仍指向上个展开方，
  // 导致 getLegalActions 列出的技能在执行时被 useSkill 以“无主动权”拒绝。
  const nextMainActionSide = 1 - activeSide;
  state.expansion = null;
  state.mainActionSide = nextMainActionSide;
  state.mainTurnOwner = nextMainActionSide;
  state.initiativeSide = nextMainActionSide;
  state.turn = nextMainActionSide; // 仅兼容镜像
  const newTurnPlayer = state.players[nextMainActionSide];

  // 7. 计数：展开+1；2 展开=1 大回合；4 展开=1 节
  state.expansionCount += 1;
  if(state.expansionCount>=240){state.chain=[];state.chainTerminated=false;state.pendingCard=null;state.winner='draw';state.gameOverReason='long_game_limit';state.phase=PHASE.GAME_OVER;return;}
  state.chain = [];
  state.chainTerminated = false;
  state.pendingCard = null;

  // 法尤姆命运压制：以当前展开结束、补牌和命运编织完成后的最终账面结算。
  // 展开结束固定交换进攻权；偶数展开后读取到的法尤姆，正是下一大回合首个展开的进攻方。
  if (state.expansionCount % 2 === 0 && newTurnPlayer.hero.id === 'fayoum') {
    const fate = newTurnPlayer.mechanics.fate || 0;
    // R7 Pass3: fate>=4 从2→1伤。补给通胀移除后每大回合1-2自动压伤在长局中
    // 累计过多（fate>=4 每大回合2伤=30+展开中15伤纯被动）。保留>2阈值的1伤，砍掉高点爆发。
    const amount = fate >= 2 ? 1 : 0;
    if (amount > 0) {
      damage(state, 1 - nextMainActionSide, amount, 'fate_pressure');
      state.log.push({ type: 'mechanic', side: nextMainActionSide, mechanic: 'fate_pressure', fate, amount });
    }
  }
  if (state.expansionCount % 2 === 0) {
    state.round += 1;
    // 大回合重置：产气上限、首次失血/受伤/反击、整备换手
    for (const p of state.players) {
      p.mechanics.qiThisRound = 0;
      p.mechanics.firstBloodThisRound = false;
      p.mechanics.firstHurtThisRound = false;
      p.mechanics.firstCounterThisRound = false;
      p.mechanics.royalOrderUsedThisRound = false;
      p.mechanics.handRedrawUsedThisRound = false;
      p.mechanics.qiuFirstSelfDamageThisRound = false;
      p.mechanics.qiuSuppressBreakUsedThisRound = false;
      p.mechanics.lanyuFreeFlyUsedThisRound = false;
    }
    // 补给点轮换
    state.supplyIndex += 1;
  }
  if (state.expansionCount % CONST.EXPANSIONS_PER_SECTION === 0) {
    state.section = Math.min(CONST.SECTIONS, state.section + 1);
    for (let side = 0; side < state.players.length; side++) {
      gainBaiyeFeather(state, side, 1);
    }
    shrinkZone(state);
  }

  // 新展开开始：回1能、触发中毒
  const newActive=state.players[nextMainActionSide];
  const newDefender=state.players[1-nextMainActionSide];
  newDefender.mechanics.followResponseUsedThisEnemyExpansion=false;
  // 防守响应发生在敌方展开内；取得进攻权时重新建立自己的“本展开”计数。
  newActive.mechanics.followStepAvailable=0;
  newActive.mechanics.luojiSecondRefundUsed=false;
  newActive.mechanics.painRoarUsed=false;
  newActive.mechanics.painExcited=false;
  newActive.mechanics.activeHealUsedThisExpansion=false;
  newActive.energy=Math.min(CONST.ENERGY_MAX,newActive.energy+1);
  const poison = getStatus(newActive, PERSISTENT.POISON);
  if (poison) {
    damage(state, nextMainActionSide, poison.stacks, 'poison');
    poison.remainingTriggers = (poison.remainingTriggers ?? 2) - 1;
    if (poison.remainingTriggers <= 0) removeStatus(state, nextMainActionSide, PERSISTENT.POISON);
  }

  // 击倒复检
  if (active.hp <= 0) {
    state.winner = 1 - activeSide;
    state.phase = PHASE.GAME_OVER;
  } else if (newActive.hp <= 0) {
    state.winner = activeSide;
    state.phase = PHASE.GAME_OVER;
  }else if(newActive.mechanics.lafengSeize){
    newActive.mechanics.lafengSeize=false;newActive.mechanics.lafengSeizeFollow=true;state.phase=PHASE.CHASE_WINDOW;
    state.log.push({type:'mechanic',side:nextMainActionSide,mechanic:'lafeng_seize'});
  }else{
    state.phase=PHASE.PRE_ATTACK;
  }
}

/**
 * 补给点四选一：玩家在 SUPPLY_CHOICE 相位选择后调用。
 * 引擎自包含：不依赖 data 层，option 用字符串入参驱动四类收益。
 * 占用即轮换：supplyIndex 立即 +1。
 * @param {Object} state
 * @param {number} side  选择方（必须 = 当前展开主动方）
 * @param {string} option  'heal' | 'energy' | 'draw' | 'shield'
 * @returns {{ ok: boolean, error?: string }}
 */
function resolveSupplyChoice(state, side, option) {
  if (state.phase !== PHASE.SUPPLY_CHOICE) {
    return { ok: false, error: '当前不在补给选择阶段' };
  }
  if (side !== ruleInitiativeSide(state)) {
    return { ok: false, error: '非进攻方不能选择补给' };
  }
  const active = state.players[side];
  const activeSide = side;
  switch (option) {
    case 'heal': {
      const restored = heal(state, activeSide, 3);
      state.log.push({ type: 'supply', side: activeSide, option: 'heal', amount: restored });
      break;
    }
    case 'energy':
      active.energy = Math.min(CONST.ENERGY_MAX, active.energy + 1);
      state.log.push({ type: 'supply', side: activeSide, option: 'energy', energy: active.energy });
      break;
    case 'draw':
      drawCards(state, activeSide, 1);
      state.log.push({ type: 'supply', side: activeSide, option: 'draw' });
      break;
    case 'shield':
      addStatus(state, activeSide, PERSISTENT.SHIELD, 'supply', { stacks: 1 });
      state.log.push({ type: 'supply', side: activeSide, option: 'shield' });
      break;
    default:
      return { ok: false, error: `无效补给选项: ${option}` };
  }
  // 占用即轮换：补给点被选择后立即移到下一个位置
  state.supplyIndex += 1;
  // 继续展开结束管线剩余步骤
  _finishExpansion(state, activeSide);
  return { ok: true };
}

/** 缩域：按节数封锁外圈。 */
function shrinkZone(state){
  if(!state.board.hex){const N=state.board.size,level=state.section-1;if(level<=0)return;for(let r=0;r<N;r++)for(let c=0;c<N;c++){const ring=Math.min(r,c,N-1-r,N-1-c);if(ring<level)state.board.cells[r][c].zone=false;}return;}
  const stage=state.board.shrinkStages?.find(s=>s.section===state.section)||state.board.shrinkStages?.at(-1);const danger=new Set(stage?.danger||[]),locked=new Set(stage?.locked||[]);
  for(const row of state.board.cells)for(const cell of row){if(!cell?.exists)continue;cell.zone=!locked.has(cell.label);cell.danger=danger.has(cell.label);}
}

// ---------------------------------------------------------------------------
// 事务包装
// ---------------------------------------------------------------------------

/**
 * 在 clone 上执行操作，成功则提交，异常则回滚并返回可读错误。
 * @param {object} state 当前状态（不会被修改）
 * @param {function} fn 操作函数，接收 draft state，返回结果
 * @returns {{ok:true, state:object, result:any} | {ok:false, state:object, error:string}}
 */
function transact(state, fn) {
  const draft = clone(state);
  try {
    const result = fn(draft);
    return { ok: true, state: draft, result };
  } catch (err) {
    return { ok: false, state, error: err.message };
  }
}


// ==================== data/heroes.js ====================
// ============================================================================
// V6 角色数据层 — 融合 V4.1 文本骨架 + V4.2.1 数值补丁 + V6 三层重分类
// 数据契约：每个角色 { id, name, title, hp, verb, mechanics[], skills[], ultimates[], cards[] }
//   mechanics: 常驻被动（不花钱）
//   skills:    耗能技能（能量，限次）
//   ultimates: 绝技（气，每局1次）
//   cards:     15 张普通牌
// 数值规范：1能≈2伤, 1状态≈1伤, 1位移≈1能, 追击减费=奖励1能（见设计04 §11）
// ============================================================================

// 卡牌类型
const CARD_TYPE = {
  ATTACK: 'attack',     // 攻击（可作起手或追击）
  COUNTER: 'counter',   // 反击
  MOVE: 'move',         // 移动
  BUFF: 'buff',         // 增益
  RESOURCE: 'resource', // 资源
  CONTROL: 'control',   // 控制
  HEAL: 'heal',         // 恢复
  STATE: 'state',       // 状态（切换形态）
};

// 时机
const TIMING = {
  STARTER: 'starter',   // 起手（主动阶段）
  FOLLOW: 'follow',     // 追击（追击窗口）
  COUNTER: 'counter',   // 反击（响应窗口）
  ACTION: 'action',     // 行动（非攻击，攻击前）
};

const HEROES = {
  // ==========================================================================
  // 洛基 —— 逆境换血
  // ==========================================================================
  luoji: {
    id: 'luoji',
    name: '洛基',
    title: '白洛克鸡',
    emoji: '🥊',
    hp: 21, // R7 Pass4: 20→21（补给通胀移除后补生存，但22过高反压白夜拉封）
    verb: '逆境换血',
    style: '稳定连打、逆境爆发',
    counters: { beats: ['qiu013'], loses: ['lafeng'] }, // 克囚徒，被拉封克
    mechanics: [
      { id: 'hardy', text: '硬抗反击：每大回合首次失血后+1气并回1血。' }, // R7 Pass4: +回1血（补续航）
      { id: 'rhythm', text: '连打节奏：本展开第4张攻击摸1。' },
      { id: 'adversity_heart', text: '逆境心脏：每大回合首次受伤后，下一张攻击+1伤。' }, // V6并入
    ],
    skills: [ // V6：耗能量，限次
      { id: 'champ_round', name: '冠军回合', cost: 2, limit: 'round', text: '本展开前三次攻击+1伤。' },
      { id: 'hell_train', name: '地狱训练', cost: 2, limit: 'section', text: '回3生命并抽2。' },
      { id: 'corner_storm', name: '角落风暴', cost: 2, limit: 'round', text: '本展开撞墙伤害+2。' },
    ],
    ultimates: [ // V6：耗气，每局1次
      { id: 'ten_sec_kill', name: '十秒绝杀', qi: 4, text: '相邻目标6伤；目标生命≤7时改为8伤。', damage: 6, executeHp: 7, executeDamage: 8 }, // V6 R1: 斩杀线9→7，削"换血→斩杀"闭环的稳定收头（9血≈对手1/3血过高）
    ],
    cards: [
      { name: '试探刺拳', cost: 1, type: 'attack', timing: 'starter', damage: 2, condition: '', effect: '', range: 1 },
      { name: '摆拳压身', cost: 1, type: 'attack', timing: 'starter', damage: 1, condition: '', effect: 'knock', range: 1 },
      { name: '上钩拳', cost: 1, type: 'attack', timing: 'starter', damage: 1, condition: '', effect: 'air', range: 1 },
      { name: '滑步逼近', cost: 0, type: 'move', timing: 'action', damage: 0, condition: '', effect: 'move', range: 0 },
      { name: '一二连打', cost: 2, type: 'attack', timing: 'follow', damage: 2, condition: 'hit', effect: '', range: 1 },
      { name: '肝脏重拳', cost: 2, type: 'attack', timing: 'follow', damage: 2, condition: 'hurt', effect: '', range: 1 }, // V4.2.1: 3→2伤
      { name: '抱架顶肘', cost: 1, type: 'counter', timing: 'counter', damage: 2, condition: 'melee', effect: 'knock', range: 1 },
      { name: '抱架闪身', cost: 0, type: 'counter', timing: 'counter', damage: 0, condition: 'any', effect: 'evade', range: 0 },
      { name: '绳角压迫', cost: 1, type: 'attack', timing: 'follow', damage: 1, condition: 'wall', effect: '', range: 1 },
      { name: '缠抱逼停', cost: 1, type: 'attack', timing: 'starter', damage: 1, condition: '', effect: 'stiff', range: 1 },
      { name: '血性冲拳', cost: 2, type: 'attack', timing: 'follow', damage: 2, condition: 'selfhurt', effect: '', range: 1 }, // V4.2.1: 1→2费
      { name: '钟摆回避', cost: 0, type: 'move', timing: 'action', damage: 0, condition: '', effect: 'move', range: 0 },
      { name: '终结摆拳', cost: 2, type: 'attack', timing: 'follow', damage: 3, condition: 'lowhp', effect: 'knock', range: 1 },
      { name: '重压追击', cost: 1, type: 'attack', timing: 'follow', damage: 2, condition: 'air', effect: 'down', range: 1 },
      { name: '冠军怒吼', cost: 1, type: 'buff', timing: 'action', damage: 0, condition: '', effect: 'buff_luoji_roar', range: 0 }, // V4.2.1: 失1血下一击+1
    ],
  },

  // ==========================================================================
  // 赤羽战魂 —— 撞墙压制
  // ==========================================================================
  chiyu: {
    id: 'chiyu',
    name: '赤羽战魂',
    title: '火鸡',
    emoji: '🪶',
    hp: 25, // V4.2.1 补丁
    verb: '撞墙压制',
    style: '压制、击退、撞墙爆发',
    counters: { beats: ['lafeng'], loses: ['xuanyi'] },
    mechanics: [
      { id: 'war_dance', text: '战舞推进：每展开1次，击退后可前进1格。' }, // V4.2.1: 2→1次
      { id: 'war_spirit', text: '战意叠加：本展开第2次攻击+3伤。' }, // R7 Pass3: +2→+3（赤羽vs白夜20%最重失衡）
    ],
    skills: [
      { id: 'sun_dance', name: '烈日战舞', cost: 2, limit: 'round', text: '本展开所有击退+1格。' },
      { id: 'ancestral_hunt', name: '先民围猎', cost: 2, limit: 'section', text: '目标不能主动移动，你对其+1伤。' },
      { id: 'blood_totem', name: '血祭图腾', cost: 1, limit: 'round', text: '失2生命，本展开攻击+1伤。' }, // V4.2.1: +2→+1
    ],
    ultimates: [
      { id: 'crown_skysurge', name: '羽冠冲天', qi: 4, text: '突进5伤并击退2，撞墙再+2。', damage: 5, knock: 2, wallBonus: 2, dash: 2 },
    ],
    cards: [
      { name: '祭羽短斧', cost: 1, type: 'attack', timing: 'starter', damage: 3, condition: '', effect: '', range: 1 }, // V6 R7 平衡: 2→3伤（赤羽输出不足，主食起手标准化）
      { name: '鹰羽投矛', cost: 2, type: 'attack', timing: 'starter', damage: 2, condition: 'range', effect: '', range: 3 },
      { name: '战舞冲撞', cost: 1, type: 'attack', timing: 'starter', damage: 1, condition: '', effect: 'knock', range: 1 },
      { name: '祈日踏击', cost: 1, type: 'attack', timing: 'follow', damage: 4, condition: 'hit', effect: 'down', range: 1 }, // R7 Pass3: 3→4伤（赤羽追击压血线）
      { name: '先民号角', cost: 1, type: 'buff', timing: 'action', damage: 0, condition: '', effect: 'buff_chiyu_horn', range: 0 },
      { name: '图腾横扫', cost: 2, type: 'attack', timing: 'starter', damage: 2, condition: '', effect: 'knock2', range: 1 },
      { name: '猎场追袭', cost: 1, type: 'attack', timing: 'follow', damage: 2, condition: 'knock', effect: '', range: 1 }, // V6 R6: 1→2伤，回到1能≈2伤基线
      { name: '羽冠裂颅', cost: 1, type: 'attack', timing: 'follow', damage: 2, condition: 'down', effect: 'stiff', range: 1 },
      { name: '侧身避枪', cost: 1, type: 'counter', timing: 'counter', damage: 0, condition: 'range', effect: 'evade', range: 3 },
      { name: '战痕献祭', cost: 2, type: 'attack', timing: 'follow', damage: 2, condition: 'hit', effect: 'selfhurt', range: 1 }, // V6 R6: 1→2伤，自损换输出的费用效率不再倒挂
      { name: '太阳坠击', cost: 2, type: 'attack', timing: 'starter', damage: 2, condition: 'dash', effect: '', range: 1, dash: 2 }, // V4.2.1: 3→2伤
      { name: '围猎逼墙', cost: 1, type: 'attack', timing: 'follow', damage: 2, condition: 'wall', effect: 'knock', range: 1 }, // V6 R6: 1→2伤，撞墙压制的核心收益要够硬
      { name: '尾羽震喝', cost: 1, type: 'control', timing: 'action', damage: 0, condition: '', effect: 'seal', range: 0 }, // V4.2.1: 0→1费
      { name: '猛火追顶', cost: 1, type: 'attack', timing: 'follow', damage: 1, condition: 'hit', effect: 'knock', range: 1 },
      { name: '祖灵佑身', cost: 1, type: 'counter', timing: 'counter', damage: 1, condition: 'melee', effect: 'guard', range: 1 },
    ],
  },

  // ==========================================================================
  // 拉封骑士 —— 反击精确
  // ==========================================================================
  lafeng: {
    id: 'lafeng',
    name: '拉封骑士',
    title: '法国雄鸡',
    emoji: '⚜️',
    hp: 24, // V4.2.1 补丁
    verb: '反击精确',
    style: '反击、精确、少而强',
    counters: { beats: ['luoji'], loses: ['chiyu'] },
    mechanics: [
      { id: 'duel_counter', text: '决斗反击：每大回合首次反击命中后摸1；每个敌方展开可额外响应首张追击。' },
      { id: 'graceful_end', text: '优雅收势：若本展开只用1张攻击，收势时回1血并向对手移动1。' }, // R7 Pass3: +回1血（轻杠杆，补给通胀移除后补续航）
      { id: 'royal_order', text: '王室军令：每大回合首次反击费用-1。' }, // V6并入
    ],
    skills: [
      { id: 'duel_oath', name: '决斗宣誓', cost: 2, limit: 'round', text: '本展开若只攻击1次，该攻击+2伤。' }, // V6 R6: +3→+2，首击7伤压到6伤
      { id: 'glory_call', name: '荣耀宣令', cost: 1, limit: 'round', text: '本展开下一张反击牌费用-1且反击伤害+1。' },
      { id: 'curtain_call', name: '谢幕之礼', cost: 2, limit: 'section', text: '若本展开只攻击1次，回3生命并得1气。' },
    ],
    ultimates: [
      { id: 'lance_charge', name: '骑枪总冲', qi: 4, text: '突进5伤，命中后可接任意追击。', damage: 5, dash: 2, openChase: true },
    ],
    cards: [
      { name: '细剑点刺', cost: 1, type: 'attack', timing: 'starter', damage: 2, condition: '', effect: '', range: 1 }, // V4.2.1: 2→3伤; V6 R7 平衡: 3→2伤（去1费3伤 outlier，拉封过强）
      { name: '斜挑礼剑', cost: 1, type: 'attack', timing: 'starter', damage: 2, condition: '', effect: 'air', range: 1 }, // V4.2.1: 1→2伤
      { name: '骑枪突进', cost: 2, type: 'attack', timing: 'starter', damage: 3, condition: 'dash', effect: '', range: 1, dash: 2 },
      { name: '护手击', cost: 1, type: 'attack', timing: 'starter', damage: 1, condition: '', effect: 'stiff', range: 1 },
      { name: '侧步行礼', cost: 0, type: 'move', timing: 'action', damage: 0, condition: '', effect: 'move', range: 0 },
      { name: '反手格挡', cost: 1, type: 'counter', timing: 'counter', damage: 1, condition: 'melee', effect: 'guard', range: 1 },
      { name: '决斗还刺', cost: 2, type: 'counter', timing: 'counter', damage: 2, condition: 'any', effect: '', range: 0 },
      { name: '蓝靴追袭', cost: 1, type: 'attack', timing: 'follow', damage: 2, condition: 'air', effect: 'knock', range: 1 }, // V4.2.1: 2→3伤; V6 R7 平衡: 3→2伤（去air连招3伤 outlier）
      { name: '白羽回旋', cost: 2, type: 'attack', timing: 'starter', damage: 2, condition: '', effect: 'move', range: 1 },
      { name: '骑士践踏', cost: 1, type: 'attack', timing: 'starter', damage: 2, condition: '', effect: 'down', range: 1 }, // V4.2.1: 1→2伤
      { name: '荣耀宣令', cost: 1, type: 'buff', timing: 'action', damage: 0, condition: '', effect: 'buff_lafeng_glory', range: 0 },
      { name: '尖锋延刺', cost: 2, type: 'attack', timing: 'starter', damage: 3, condition: 'range', effect: '', range: 3 },
      { name: '玫瑰终幕', cost: 2, type: 'attack', timing: 'follow', damage: 3, condition: 'status', effect: '', range: 1 },
      { name: '护旗逼退', cost: 1, type: 'attack', timing: 'starter', damage: 2, condition: '', effect: 'knock', range: 1 }, // V4.2.1: 1→2伤
      { name: '冷静整队', cost: 0, type: 'resource', timing: 'action', damage: 0, condition: '', effect: 'draw', range: 0 },
    ],
  },

  // ==========================================================================
  // 囚徒013 —— 自残爆发
  // ==========================================================================
  qiu013: {
    id: 'qiu013',
    name: '囚徒013',
    title: '激素怪鸡',
    emoji: '🧪',
    hp: 27, // V4.2.1 补丁
    verb: '自残爆发',
    style: '自残爆发、高风险追杀',
    counters: { beats: ['xuanyi'], loses: ['luoji'] },
    mechanics: [
      { id: 'overload', text: '过载：本展开第3张攻击+1伤，然后失1生命。' }, // V4.2.1: +2→+1
      { id: 'suppress_break', text: '抑制崩坏：每大回合1次，主动收势且未攻击时，回2生命摸1。' }, // V6 R4: 不限次导致憋尿拖超时成最优解
      { id: 'ultimate_mod', text: '终极改造：每大回合首次自损后摸1。' }, // V6并入
    ],
    skills: [
      { id: 'full_overload', name: '完全过载', cost: 2, limit: 'round', text: '本展开第2与第3次攻击各+1伤，结束失1生命。' }, // V4.2.1
      { id: 'bio_molt', name: '生化蜕皮', cost: 2, limit: 'section', text: '清除状态并回4生命。' },
      { id: 'hormone_tide', name: '荷尔蒙潮汐', cost: 1, limit: 'round', text: '本展开下一张自损牌伤害+2，自损最多1。' },
    ],
    ultimates: [
      { id: 'frenzy_execute', name: '狂噬处刑', qi: 4, text: '对异常目标7伤。', damage: 7, needStatus: true },
    ],
    cards: [
      { name: '药剂刺入', cost: 2, type: 'attack', timing: 'follow', damage: 2, condition: 'selfhurt', effect: '', range: 1 }, // V4.2.1: 1→2费
      { name: '约束崩裂', cost: 1, type: 'attack', timing: 'starter', damage: 1, condition: '', effect: 'knock', range: 1 },
      { name: '畸变上撩', cost: 1, type: 'attack', timing: 'starter', damage: 1, condition: '', effect: 'air', range: 1 },
      { name: '兽性扑咬', cost: 2, type: 'attack', timing: 'starter', damage: 3, condition: 'dashself', effect: '', range: 1, dash: 2 },
      { name: '失控重砸', cost: 2, type: 'attack', timing: 'follow', damage: 3, condition: 'status', effect: '', range: 1 },
      { name: '链枷横扫', cost: 1, type: 'attack', timing: 'starter', damage: 2, condition: '', effect: 'stiff', range: 1 },
      { name: '抑制针', cost: 1, type: 'counter', timing: 'counter', damage: 0, condition: 'any', effect: 'guard', range: 0 },
      { name: '铁笼反扑', cost: 2, type: 'counter', timing: 'counter', damage: 2, condition: 'melee', effect: 'down', range: 1 },
      { name: '狂化追噬', cost: 2, type: 'attack', timing: 'follow', damage: 2, condition: 'airdown', effect: 'down', range: 1 }, // V4.2.1: 不再自损
      { name: '肌暴冲刺', cost: 1, type: 'move', timing: 'action', damage: 0, condition: '', effect: 'move2', range: 0 },
      { name: '剧痛咆哮', cost: 0, type: 'resource', timing: 'action', damage: 0, condition: '', effect: 'draw2_selfhurt', range: 0 }, // V4.2.1: 失1血摸2
      { name: '断骨踩踏', cost: 2, type: 'attack', timing: 'follow', damage: 2, condition: 'down', effect: 'stiff', range: 1 }, // V4.2.1: 1→2费
      { name: '囚号撞墙', cost: 2, type: 'attack', timing: 'starter', damage: 2, condition: '', effect: 'knock2', range: 1 },
      { name: '失温蜷缩', cost: 0, type: 'heal', timing: 'action', damage: 2, condition: '', effect: '', range: 0 },
      { name: '荷尔蒙潮汐', cost: 1, type: 'buff', timing: 'action', damage: 0, condition: '', effect: 'buff_qiu_hormone', range: 0 },
    ],
  },

  // ==========================================================================
  // 白夜 —— 成长觉醒
  // ==========================================================================
  baiye: {
    id: 'baiye',
    name: '白夜',
    title: '丑小鸭',
    emoji: '🦢',
    hp: 27, // V4.2.1 补丁
    verb: '成长觉醒',
    style: '成长、觉醒、后期压制',
    counters: { beats: ['youying'], loses: ['lanyu'] },
    mechanics: [
      { id: 'growth', text: '成长：开局1层进化羽，每节结束+1，最多5。' }, // V4.2.1: 开局即1层
      { id: 'awaken', text: '觉醒：3层进化羽后，战术步移2格，对异常目标+1伤；满足条件的追击额外-1费。' },
      { id: 'swan_crown', text: '天鹅王冠：觉醒时回4生命。' }, // V6并入
    ],
    skills: [
      { id: 'chick_guard', name: '雏羽护心', cost: 1, limit: 'section', text: '首次受伤-2并获得1进化羽。' },
      { id: 'cocoon_form', name: '破茧成形', cost: 2, limit: 'section', text: '获得2进化羽并抽2。' },
      { id: 'lake_dance', name: '湖上独舞', cost: 2, limit: 'round', text: '本展开每次移动令下一击+1伤。' },
    ],
    ultimates: [
      { id: 'ice_finale', name: '冰面终曲', qi: 4, text: '追击窗口终结技：对异常目标6伤；觉醒后再弃其1牌，结算后自动收势。', damage: 6, needStatus: true, awakeDiscard: true },
    ],
    cards: [
      { name: '灰羽轻啄', cost: 1, type: 'attack', timing: 'follow', damage: 2, condition: 'feather', effect: '', range: 1 },
      { name: '笨拙扑腾', cost: 0, type: 'move', timing: 'action', damage: 0, condition: '', effect: 'move', range: 0 },
      { name: '稚羽上挑', cost: 1, type: 'attack', timing: 'starter', damage: 2, condition: '', effect: 'air', range: 1 }, // V6 R6: 1→2伤，觉醒前不再空转
      { name: '缩颈防身', cost: 1, type: 'counter', timing: 'counter', damage: 0, condition: 'melee', effect: 'evade', range: 1 },
      { name: '水面借力', cost: 1, type: 'buff', timing: 'action', damage: 0, condition: '', effect: 'buff_baiye_water', range: 0 },
      { name: '湖畔追啄', cost: 1, type: 'attack', timing: 'follow', damage: 2, condition: 'air', effect: '', range: 1 },
      { name: '斜翼掠水', cost: 1, type: 'attack', timing: 'starter', damage: 2, condition: 'range', effect: 'knock', range: 3 }, // V6 R6: 1→2伤，远程起手有实际压制
      { name: '翻羽落地', cost: 1, type: 'attack', timing: 'follow', damage: 1, condition: 'hit', effect: 'move', range: 1 },
      { name: '幼生惊逃', cost: 0, type: 'counter', timing: 'counter', damage: 0, condition: 'any', effect: 'evade', range: 0 },
      { name: '破壳跃升', cost: 2, type: 'attack', timing: 'follow', damage: 2, condition: 'feather2', effect: 'down', range: 1 },
      { name: '羽轴新生', cost: 1, type: 'heal', timing: 'action', damage: 2, condition: '', effect: 'feather', range: 0 },
      { name: '白颈长击', cost: 2, type: 'attack', timing: 'starter', damage: 3, condition: 'range', effect: '', range: 3 },
      { name: '天鹅旋身', cost: 2, type: 'attack', timing: 'starter', damage: 2, condition: '', effect: 'move', range: 1 },
      { name: '逆风展翼', cost: 1, type: 'buff', timing: 'action', damage: 0, condition: '', effect: 'buff_baiye_wind', range: 0 },
      { name: '终成白夜', cost: 2, type: 'attack', timing: 'follow', damage: 3, condition: 'awake', effect: 'draw', range: 1 },
    ],
  },

  // ==========================================================================
  // 岚羽 —— 飞行机动
  // ==========================================================================
  lanyu: {
    id: 'lanyu',
    name: '岚羽',
    title: '雉鸡',
    emoji: '🪽',
    hp: 25, // V4.2.1 补丁
    verb: '飞行机动',
    style: '飞行、俯冲、立体机动',
    counters: { beats: ['baiye'], loses: ['youying'] },
    mechanics: [
      { id: 'flight', text: '飞行：进入后到自己展开结束，无视阻挡且免疫击退。' }, // V4.2.1: 持续到自己展开结束
      { id: 'dive', text: '俯冲：飞行中第一次攻击+3伤。' }, // V4.2.1: +1→+3
      { id: 'eternal_soar', text: '永翔之魂：每大回合首次进入飞行费用0。' }, // V6并入
    ],
    skills: [
      { id: 'sky_hunt', name: '苍穹猎道', cost: 1, limit: 'round', text: '进入飞行，本展开飞行攻击+1伤。' },
      { id: 'gale_net', name: '岚尾收网', cost: 2, limit: 'section', text: '使目标浮空且不能主动移动。' },
      { id: 'sky_cry', name: '天际鸣啸', cost: 1, limit: 'round', text: '进入飞行，本展开下一张飞行攻击+1伤。' },
    ],
    ultimates: [
      { id: 'phoenix_shadow', name: '凤冠绝影', qi: 3, text: '飞行中对目标8伤。', damage: 8, needFly: true }, // V6 R1: 4→3气，当前气经济下4气不可达
    ],
    cards: [
      { name: '展翼啄击', cost: 1, type: 'attack', timing: 'starter', damage: 3, condition: '', effect: '', range: 1 }, // V4.2.1: 2→3伤
      { name: '轻羽滑翔', cost: 0, type: 'state', timing: 'action', damage: 0, condition: '', effect: 'fly_draw_qi', range: 0 }, // V6 R1: fly_draw→fly_draw_qi，免费进飞行摸1+1气（岚羽独有气源）
      { name: '高枝俯冲', cost: 1, type: 'attack', timing: 'follow', damage: 6, condition: 'fly', effect: '', range: 1 }, // V4.2.1: 2费3伤→1费6伤
      { name: '长尾横扫', cost: 1, type: 'attack', timing: 'starter', damage: 2, condition: '', effect: 'knock', range: 1 }, // V4.2.1: 1→2伤
      { name: '凌空挑翎', cost: 1, type: 'attack', timing: 'starter', damage: 2, condition: '', effect: 'air', range: 1 }, // V4.2.1: 1→2伤
      { name: '飘羽回身', cost: 1, type: 'move', timing: 'action', damage: 0, condition: '', effect: 'move', range: 0 },
      { name: '盘旋追击', cost: 1, type: 'attack', timing: 'follow', damage: 3, condition: 'air', effect: 'move', range: 1 }, // V4.2.1: 2→3伤
      { name: '断翅反闪', cost: 1, type: 'counter', timing: 'counter', damage: 0, condition: 'range', effect: 'fly', range: 3 },
      { name: '掠林飞矛', cost: 2, type: 'attack', timing: 'starter', damage: 3, condition: 'range', effect: '', range: 3 }, // V4.2.1: 2→3伤
      { name: '鸣林疾步', cost: 0, type: 'move', timing: 'action', damage: 0, condition: '', effect: 'move2', range: 0 },
      { name: '翔跃收势', cost: 1, type: 'control', timing: 'action', damage: 0, condition: '', effect: 'zone', range: 0 },
      { name: '彩翼震慑', cost: 1, type: 'control', timing: 'action', damage: 0, condition: '', effect: 'seal', range: 0 },
      { name: '鹊羽乱击', cost: 1, type: 'attack', timing: 'follow', damage: 3, condition: 'hit', effect: '', range: 1 }, // V4.2.1: 2→3伤
      { name: '落羽陷杀', cost: 2, type: 'attack', timing: 'follow', damage: 4, condition: 'air', effect: 'down', range: 1 }, // V4.2.1: 3→4伤
      { name: '天际鸣啸', cost: 1, type: 'buff', timing: 'action', damage: 0, condition: '', effect: 'buff_lanyu_cry', range: 0 },
    ],
  },

  // ==========================================================================
  // 游影·麻步 —— 位移节奏
  // ==========================================================================
  youying: {
    id: 'youying',
    name: '游影·麻步',
    title: '麻鸡',
    emoji: '💨',
    hp: 25, // V4.2.1 补丁
    verb: '位移节奏',
    style: '打了就走、位移换节奏',
    counters: { beats: ['lanyu'], loses: ['baiye'] },
    mechanics: [
      { id: 'wander', text: '游步：每展开最多2次，攻击结算后自动向目标移动1格（无法更近时不消耗次数）。' }, // 审计：代码为自动移动，文案如实改写
      { id: 'momentum', text: '借势：本展开每次移动后，下一张攻击+1伤；每展开最多触发2次。' }, // V6 R6: 对齐游步2次，斩断免费循环
      { id: 'shadowless', text: '无影境：每展开第一张移动牌费用0（该移动仍可触发借势，非额外叠加）。' }, // V6并入
    ],
    skills: [
      { id: 'flow_break', name: '流步破阵', cost: 2, limit: 'round', text: '本展开游步距离改2，首次游步后摸1弃1。' },
      { id: 'swift_double', name: '疾影二段', cost: 2, limit: 'section', text: '立即向目标移动2格；本展开下一次追击忽略条件。' },
      { id: 'light_breath', name: '轻身回气', cost: 0, limit: 'round', text: '移动1格，自己+1能，对手-1能。' }, // 游码核心
    ],
    ultimates: [
      { id: 'chaos_throat', name: '乱步封喉', qi: 4, text: '对倒地、僵直或浮空目标7伤。', damage: 7, needDownStiffOrAir: true }, // V6 R1: needDownOrStiff→needDownStiffOrAir，放宽含浮空（游影造air手段多）
    ],
    cards: [
      { name: '碎步点啄', cost: 1, type: 'attack', timing: 'starter', damage: 2, condition: '', effect: '', range: 1 },
      { name: '滑肩闪身', cost: 0, type: 'move', timing: 'action', damage: 0, condition: '', effect: 'move', range: 0 },
      { name: '斜切扫腿', cost: 1, type: 'attack', timing: 'follow', damage: 2, condition: 'hit', effect: 'down', range: 1 }, // V4.2.1: 1→2伤
      { name: '趁步上挑', cost: 1, type: 'attack', timing: 'follow', damage: 2, condition: 'moved', effect: 'air', range: 1 }, // V4.2.1: 1→2伤
      { name: '缠腰贴打', cost: 1, type: 'attack', timing: 'starter', damage: 3, condition: '', effect: 'move', range: 1 }, // V4.2.1: 2→3伤
      { name: '飞踢借势', cost: 2, type: 'attack', timing: 'starter', damage: 4, condition: 'dash', effect: '', range: 1, dash: 2 }, // V4.2.1: 3→4伤
      { name: '游墙折返', cost: 1, type: 'move', timing: 'action', damage: 0, condition: '', effect: 'move2', range: 0 },
      { name: '追步连啄', cost: 1, type: 'attack', timing: 'follow', damage: 3, condition: 'hit', effect: 'move', range: 1 }, // V4.2.1: 2→3伤
      { name: '穿档滑步', cost: 1, type: 'counter', timing: 'counter', damage: 0, condition: 'melee', effect: 'evade', range: 1 },
      { name: '失衡拨翅', cost: 1, type: 'attack', timing: 'follow', damage: 2, condition: 'moved', effect: 'knock', range: 1 }, // V4.2.1: 1→2伤
      { name: '轻身回气', cost: 0, type: 'resource', timing: 'action', damage: 0, condition: '', effect: 'moveenergy', range: 0 },
      { name: '反跑抽打', cost: 1, type: 'attack', timing: 'follow', damage: 3, condition: 'down', effect: 'move', range: 1 }, // V4.2.1: 2→3伤
      { name: '借势回旋', cost: 2, type: 'attack', timing: 'follow', damage: 4, condition: 'moved', effect: 'move', range: 1 }, // V4.2.1: 3→4伤
      { name: '游影封线', cost: 1, type: 'control', timing: 'action', damage: 0, condition: '', effect: 'zone', range: 0 },
      { name: '快意脱手', cost: 1, type: 'attack', timing: 'starter', damage: 2, condition: 'range', effect: 'move', range: 3 }, // V4.2.1: 1→2伤
    ],
  },

  // ==========================================================================
  // 玄医·乌骨 —— 回血反打
  // ==========================================================================
  xuanyi: {
    id: 'xuanyi',
    name: '玄医·乌骨',
    title: '乌鸡',
    emoji: '⚕️',
    hp: 28, // V4.2.1 补丁
    verb: '回血反打',
    style: '恢复、拖节奏、反打',
    counters: { beats: ['chiyu'], loses: ['qiu013'] },
    mechanics: [
      { id: 'nurture_qi', text: '养气：主动收势时本展开未失血且未用恢复牌，回1生命。' }, // R7 Pass3: 回2→回1（补给通胀移除后过强）
      { id: 'rejuvenate', text: '回春：每大回合1次，付2气回2生命；每展开至多1张主动恢复牌或1次回春。' }, // V4.2.1
      { id: 'medic_master', text: '医宗真传：养气回复量+1。' }, // R7 Pass3 note: 引擎硬编码回1已合并，此文本仅展示原设计
    ],
    skills: [
      { id: 'herb_revive', name: '百草回魂', cost: 2, limit: 'section', text: '回4生命并清除状态。' }, // V4.2.1: 5→4
      { id: 'great_cycle', name: '养生大周天', cost: 2, limit: 'round', text: '展开结束时回2生命并得1气。' }, // V4.2.1: 3→2
      { id: 'defense_offense', name: '以守为攻', cost: 1, limit: 'round', text: '本展开下一张反击牌费用-1且伤害+1。' },
    ],
    ultimates: [
      { id: 'life_needle', name: '借寿针', qi: 4, text: '目标5伤；本展开治疗过则+1。', damage: 5, healedBonus: 1 },
    ],
    cards: [
      { name: '药羽点穴', cost: 1, type: 'attack', timing: 'starter', damage: 1, condition: '', effect: 'stiff', range: 1 },
      { name: '黑骨拍击', cost: 1, type: 'attack', timing: 'starter', damage: 3, condition: '', effect: '', range: 1 }, // V4.2.1: 2→3伤
      { name: '参汤调息', cost: 2, type: 'heal', timing: 'action', damage: 1, condition: '', effect: 'draw', range: 0 }, // V4.2.1: 回2→回1
      { name: '走经回脉', cost: 0, type: 'resource', timing: 'action', damage: 0, condition: '', effect: 'qi', range: 0 },
      { name: '安神封步', cost: 1, type: 'attack', timing: 'starter', damage: 1, condition: '', effect: 'stiff', range: 1 },
      { name: '温骨退邪', cost: 2, type: 'heal', timing: 'action', damage: 1, condition: '', effect: 'clean', range: 0 }, // V4.2.1: 回2→回1
      { name: '回春追针', cost: 2, type: 'attack', timing: 'follow', damage: 1, condition: 'hit', effect: 'heal', range: 1 }, // V4.2.1: 1→2费
      { name: '药香避锋', cost: 1, type: 'counter', timing: 'counter', damage: 0, condition: 'any', effect: 'guardqi', range: 0 },
      { name: '乌羽推拿', cost: 2, type: 'attack', timing: 'follow', damage: 1, condition: 'healed', effect: 'knock', range: 1 }, // V4.2.1: 1→2费
      { name: '续命丹', cost: 2, type: 'heal', timing: 'action', damage: 2, condition: '', effect: 'stop', range: 0 }, // V4.2.1: 回4→回2
      { name: '病骨锁节', cost: 2, type: 'attack', timing: 'starter', damage: 3, condition: '', effect: 'seal', range: 1 }, // V4.2.1: 2→3伤
      { name: '阴火灸刺', cost: 2, type: 'attack', timing: 'follow', damage: 3, condition: 'qi3', effect: '', range: 1 }, // V4.2.1: qi4→qi3
      { name: '反手掐脉', cost: 2, type: 'counter', timing: 'counter', damage: 2, condition: 'melee', effect: 'stiff', range: 1 },
      { name: '以守为攻', cost: 0, type: 'buff', timing: 'action', damage: 0, condition: '', effect: 'buff_xuanyi_def', range: 0 },
      { name: '药柜压顶', cost: 2, type: 'attack', timing: 'starter', damage: 3, condition: 'range', effect: 'knock', range: 3 }, // V4.2.1: 2→3伤
    ],
  },

  // ==========================================================================
  // 法尤姆·命织者 —— 命运压制
  // ==========================================================================
  fayoum: {
    id: 'fayoum',
    name: '法尤姆·命织者',
    title: '埃及鸡',
    emoji: '🔮',
    hp: 30, // V4.2.1 补丁
    verb: '命运压制',
    style: '过牌、洗牌、命运压制',
    counters: { beats: ['lanyu', 'youying', 'baiye'], loses: ['luoji', 'qiu013'] }, // 克机动三角，被换血快攻克
    mechanics: [
      { id: 'fate_weave', text: '命运编织：每摸3张牌或完成洗牌1次，+1命运。' }, // V4.2.1: 摸3也算
      { id: 'fate_pressure', text: '命运压制：大回合开始，≥2命运即1伤。' }, // R7 Pass3: 削峰值（fate>=4 2→1）
      { id: 'sand_oracle', text: '砂时神谕：命运压制阈值-1（原需3命运→现需2命运）。' }, // R7 Pass3: 唯一阈值≥2
    ],
    skills: [
      { id: 'fate_leap', name: '命运跃迁', cost: 2, limit: 'section', text: '立即洗牌并抽5；洗牌与抽牌收益按命运编织结算。' },
      { id: 'tomb_strip', name: '王墓剥离', cost: 2, limit: 'round', text: '对手弃2牌。' },
      { id: 'star_calc', name: '星盘速算', cost: 0, limit: 'round', text: '本展开下一张牌费用-1，最低0。' },
    ],
    ultimates: [
      { id: 'endgame', name: '终局降临', qi: 4, text: '5命运时7伤，否则5伤并得1命运。', damage: 5, fateThreshold: 5, fateDamage: 7 },
    ],
    cards: [
      { name: '砂纹轻啄', cost: 1, type: 'attack', timing: 'starter', damage: 3, condition: '', effect: '', range: 1 }, // V4.2.1: 2→3伤
      { name: '圣甲抽丝', cost: 0, type: 'resource', timing: 'action', damage: 0, condition: '', effect: 'cycle', range: 0 },
      { name: '尼罗回环', cost: 1, type: 'resource', timing: 'action', damage: 0, condition: '', effect: 'draw2', range: 0 },
      { name: '太阳算式', cost: 1, type: 'resource', timing: 'action', damage: 0, condition: '', effect: 'scry', range: 0 },
      { name: '纸莎束缚', cost: 1, type: 'attack', timing: 'starter', damage: 2, condition: '', effect: 'zone', range: 1 }, // V4.2.1: 1→2伤
      { name: '亡碑针刺', cost: 1, type: 'attack', timing: 'starter', damage: 2, condition: 'range', effect: 'qi', range: 3 }, // V4.2.1: 1→2伤
      { name: '命轮拨动', cost: 0, type: 'resource', timing: 'action', damage: 0, condition: 'second', effect: 'draw', range: 0 },
      { name: '预示封口', cost: 1, type: 'control', timing: 'action', damage: 0, condition: '', effect: 'discard', range: 0 },
      { name: '黄沙退界', cost: 1, type: 'attack', timing: 'starter', damage: 1, condition: '', effect: 'knock', range: 1 },
      { name: '圣猫闪避', cost: 1, type: 'counter', timing: 'counter', damage: 0, condition: 'any', effect: 'evade', range: 0 },
      { name: '法尤姆追咒', cost: 1, type: 'attack', timing: 'follow', damage: 3, condition: 'hit', effect: '', range: 1 }, // V4.2.1: 2→3伤
      { name: '木乃伊封缠', cost: 2, type: 'attack', timing: 'follow', damage: 2, condition: 'hit', effect: 'down', range: 1 },
      { name: '星盘速算', cost: 0, type: 'resource', timing: 'action', damage: 0, condition: '', effect: 'discount', range: 0 },
      { name: '河谷长刺', cost: 2, type: 'attack', timing: 'starter', damage: 3, condition: 'range', effect: '', range: 3 },
      { name: '终页揭示', cost: 1, type: 'resource', timing: 'action', damage: 0, condition: 'lowdeck', effect: 'draw2', range: 0 },
    ],
  },
};


// ============================================================================
// V6.6 已批准角色与地图调整
// ============================================================================
function v66FindCard(heroId,name){const c=HEROES[heroId]?.cards?.find(x=>x.name===name||x.artKey===name);if(!c)throw new Error(`V6.6 找不到牌：${heroId}/${name}`);return c;}
function v66PatchCard(h,n,p){Object.assign(v66FindCard(h,n),p);}
function v66PatchSkill(h,id,p){const x=HEROES[h]?.skills?.find(s=>s.id===id);if(!x)throw new Error(`V6.6 找不到技能：${h}/${id}`);Object.assign(x,p);}
function v66PatchUlt(h,id,p){const x=HEROES[h]?.ultimates?.find(s=>s.id===id);if(!x)throw new Error(`V6.6 找不到绝技：${h}/${id}`);Object.assign(x,p);}
function v66PatchMechanic(h,id,t){const x=HEROES[h]?.mechanics?.find(s=>s.id===id);if(x)x.text=t;}
HEX_MAP_DATA.spawns={A:'E3',B:'E7'};
HEX_MAP_DATA.balanceStatus='V6.6 连击复兴候选；标准出生点已内收。';

v66PatchCard('luoji','滑步逼近',{effect:'move2',moveBudget:2,approachOnly:true,rulesText:'在2点移动力内选择合法落点；落点不得比起点更远离对手。'});
v66PatchCard('luoji','摆拳压身',{grantFollowStep:1});
v66PatchCard('luoji','抱架顶肘',{grantFollowStep:1});
v66PatchCard('luoji','一二连打',{refundEnergyAtChainStep:2,refundEnergyAmount:1});
v66PatchMechanic('luoji','rhythm','连打节奏：本展开第2击“一二连打”命中返还1能；第4张攻击摸1。');

v66PatchCard('chiyu','猎场追袭',{preMoveToward:1});
v66PatchCard('chiyu','羽冠裂颅',{conditionalRange:{condition:'down',range:2}});
v66PatchCard('chiyu','先民号角',{rulesText:'下一次击退额外+1格；击退后获得1次追步；若撞墙，再获得1气。'});

v66PatchCard('lafeng','荣耀宣令',{name:'荣耀回刺',artKey:'荣耀宣令',effect:'buff_lafeng_glory',rulesText:'本展开成功反击后，下一张起手攻击费用-1，并在攻击前向目标突进1格。'});
v66PatchCard('lafeng','玫瑰终幕',{conditionalRange:{condition:'status',range:2}});
v66PatchCard('lafeng','决斗还刺',{grantSeizeOnCounter:true});

v66PatchCard('qiu013','剧痛咆哮',{oncePerExpansion:'painRoarUsed',rulesText:'每展开最多1次：失1生命并摸2；本展开第一张满足自伤条件的追击额外-1费。'});
v66PatchCard('qiu013','失温蜷缩',{requiresSelfHurtOrDamage:true,rulesText:'仅当本展开曾自伤或受伤时可用：恢复2生命。'});
v66PatchCard('qiu013','断骨踩踏',{preMoveToward:1});
v66PatchUlt('qiu013','frenzy_execute',{chaseFinisher:true,requiresChainStatus:true,text:'本连击制造异常状态后，可在追击窗口造成7伤并自动收势。'});

v66PatchCard('baiye','水面借力',{rulesText:'下一次主动移动距离+1；移动后下一张追击伤害+1、射程+1。'});
v66PatchCard('baiye','翻羽落地',{preMoveIfLastRanged:2});
v66PatchCard('baiye','逆风展翼',{rulesText:'下一张满足条件的追击费用额外-1、射程+1；觉醒后再摸1。'});
v66PatchCard('baiye','羽轴新生',{requiresAttackForFeather:true,rulesText:'恢复2生命；本展开至少打出过1张攻击牌时，额外获得1进化羽。'});
v66PatchUlt('baiye','ice_finale',{chaseFinisher:true});

v66PatchCard('lanyu','天际鸣啸',{rulesText:'本展开下一张飞行追击费用-1、射程+1。'});
v66PatchCard('lanyu','盘旋追击',{rulesText:'对浮空目标造成3伤；命中后在1点移动力内自由选择落点。'});
v66PatchCard('lanyu','高枝俯冲',{damage:4,chainThirdBonus:1,rulesText:'飞行追击造成4伤；若是本链第3击，额外+1伤。'});
v66PatchUlt('lanyu','phoenix_shadow',{chaseFinisher:true,chainMin:2,text:'飞行中且本链已有至少2击时，造成8伤并自动收势。'});

v66PatchMechanic('youying','wander','游步：每展开最多2次；攻击结算后可选择相邻合法格，选择不移动则不消耗次数。');
v66PatchCard('youying','游墙折返',{consumeTacticalStep:true});
v66PatchCard('youying','借势回旋',{damage:3});
v66PatchUlt('youying','chaos_throat',{chaseFinisher:true,chainMin:2,text:'本链至少已有2击，且目标倒地、僵直或浮空时，造成7伤并自动收势。'});

v66PatchCard('xuanyi','回春追针',{preMoveIfHealed:1});
v66PatchCard('xuanyi','乌羽推拿',{conditionalRange:{condition:'healed',range:2}});
v66PatchCard('xuanyi','以守为攻',{name:'守中藏针',artKey:'以守为攻',effect:'buff_xuanyi_def',rulesText:'本展开成功反击后，下一张起手攻击费用-1、射程+1。'});
v66PatchUlt('xuanyi','life_needle',{chaseFinisher:true,requiresHealed:true,text:'本展开治疗过时可在追击窗口发动；5伤，治疗过额外+1，自动收势。'});
v66PatchSkill('xuanyi','great_cycle',{text:'展开结束时：若本链至少2击，回2生命并得1气；否则只回1生命。'});
v66PatchMechanic('xuanyi','medic_master','医宗真传：养气基础回复已经并入现行数值，不额外叠加。');

v66PatchCard('fayoum','亡碑针刺',{markFateLine:true});
v66PatchCard('fayoum','河谷长刺',{markFateLine:true});
v66PatchCard('fayoum','法尤姆追咒',{consumeFateLine:true,fateLineRange:3});
v66PatchCard('fayoum','木乃伊封缠',{consumeFateLine:true,fateLineRange:3});
v66PatchUlt('fayoum','endgame',{chaseFinisher:true,cardsPlayedMin:2,text:'本展开已打出至少2张牌时可在追击窗口发动；5命运7伤，否则5伤并得1命运，自动收势。'});

v66PatchSkill('youying','swift_double',{moveBudget:2,text:'在2点移动力内选择合法落点；本展开下一次追击忽略条件。'});
v66PatchSkill('youying','light_breath',{moveBudget:1,text:'在1点移动力内选择合法落点；自己+1能，对手-1能。'});



// ============================================================================
// V7.1 Combat — 九角色重做数据覆盖层
// 目标：角色语言、技能/绝技职责、AI倾向与Combo Solver共用同一份标签。
// ============================================================================
function v71PatchCard(heroId,name,patch){const c=HEROES[heroId]?.cards?.find(x=>x.name===name||x.artKey===name);if(!c)throw new Error(`V7.1 找不到牌：${heroId}/${name}`);Object.assign(c,patch);return c;}
function v71PatchSkill(heroId,id,patch){const s=HEROES[heroId]?.skills?.find(x=>x.id===id);if(!s)throw new Error(`V7.1 找不到技能：${heroId}/${id}`);Object.assign(s,patch);return s;}
function v71PatchUltimate(heroId,id,patch){const u=HEROES[heroId]?.ultimates?.find(x=>x.id===id);if(!u)throw new Error(`V7.1 找不到绝技：${heroId}/${id}`);Object.assign(u,patch);return u;}

const V71_ROLE_PROFILES={
  luoji:{identity:'命中确认与拳击压制',comboGoals:['hit','hurt','second','wall'],ai:{chain:4,setup:4,counterRisk:1},signature:['试探刺拳','一二连打','肝脏重拳']},
  chiyu:{identity:'击退距离与围猎路线',comboGoals:['knock','wall','down'],ai:{chain:3,setup:3,move:3},signature:['战舞冲撞','猎场追袭','羽冠裂颅']},
  lafeng:{identity:'精准防反与荣誉夺权',comboGoals:['counter','air','status'],ai:{reserve:5,counter:6,chain:-2},signature:['反手格挡','决斗还刺','荣耀回刺']},
  qiu013:{identity:'受伤、痛觉与失控',comboGoals:['selfhurt','hurt','status'],ai:{damage:4,chain:3,heal:-3},signature:['剧痛咆哮','血债追索','断骨踩踏']},
  baiye:{identity:'成长阶段与牌面变形',comboGoals:['feather','awake','moved'],ai:{resource:5,reserve:4,chain:2},signature:['羽轴新生','水面借力','终成白夜']},
  lanyu:{identity:'飞行、落点与俯冲',comboGoals:['fly','air','moved'],ai:{move:5,setup:4,chain:3},signature:['轻羽滑翔','盘旋追击','高枝俯冲']},
  youying:{identity:'接近、远离、侧移节奏',comboGoals:['moved','hit','status'],ai:{move:5,chain:4,efficiency:2},signature:['借势回旋','游墙折返','游影封线']},
  xuanyi:{identity:'治疗转攻与药势循环',comboGoals:['healed','hurt','status'],ai:{heal:6,reserve:3,chain:3},signature:['回春追针','乌羽推拿','守中藏针']},
  fayoum:{identity:'牌序、预言与命线',comboGoals:['second','range','hit'],ai:{resource:7,reserve:3,setup:4},signature:['太阳算式','圣甲抽丝','法尤姆追咒']},
};
for(const [id,profile] of Object.entries(V71_ROLE_PROFILES)){HEROES[id].v71Profile=profile;HEROES[id].style=profile.identity;}

// 洛基：第一击试探、第二击确认、受伤后身体打击。
v71PatchCard('luoji','试探刺拳',{v71Tags:['probe','starter','hit_confirm'],rulesText:'试探起手。命中后为“命中确认”追击建立条件。'});
v71PatchCard('luoji','一二连打',{condition:{any:['second','hit']},v71Tags:['confirm','second_hit'],rulesText:'追击：这是本展开第2击，或上一击造成有效伤害。第2击时返还1能。'});
v71PatchCard('luoji','肝脏重拳',{condition:{any:['hurt','selfhurt']},v71Tags:['body_blow','hurt_payoff'],rulesText:'追击：本展开自身或目标曾失去生命；命中确认后的身体打击。'});
v71PatchSkill('luoji','champ_round',{v71Tags:['chain_setup','attack_bonus','boxing'],text:'本展开前三次攻击+1伤；第二击额外视为命中确认。'});
v71PatchUltimate('luoji','ten_sec_kill',{v71Tags:['finisher','execute','initiative_break'],text:'相邻目标6伤；目标生命≤7时8伤。不可反击并自动收势。'});

// 赤羽：击退—撞墙—倒地链。
v71PatchCard('chiyu','战舞冲撞',{v71Tags:['forced_move','route_start','knock']});
v71PatchCard('chiyu','猎场追袭',{condition:{any:['knock','wall']},v71Tags:['forced_move_payoff','gap_close'],rulesText:'追击击退或撞墙；攻击前向目标接近1格。'});
v71PatchCard('chiyu','羽冠裂颅',{condition:{any:['down','wall']},v71Tags:['route_finisher','stiff'],rulesText:'追击倒地或撞墙目标，造成僵直。'});
v71PatchSkill('chiyu','sun_dance',{v71Tags:['chain_setup','forced_move','route_control']});
v71PatchUltimate('chiyu','crown_skysurge',{v71Tags:['finisher','forced_move','wall_payoff']});

// 拉封：响应、夺权、少击高质量。
v71PatchCard('lafeng','反手格挡',{v71Tags:['counter','guard','duel']});
v71PatchCard('lafeng','决斗还刺',{v71Tags:['counter','seize','duel'],rulesText:'反击命中后夺取展开主动权。'});
v71PatchCard('lafeng','玫瑰终幕',{condition:{any:['status','air']},v71Tags:['quality_finisher','status_payoff']});
v71PatchSkill('lafeng','glory_call',{v71Tags:['counter_setup','reserve','seize']});
v71PatchUltimate('lafeng','lance_charge',{v71Tags:['finisher','open_chase','seize']});

// 囚徒：失血/自伤作为明确的链路资源。
v71PatchCard('qiu013','剧痛咆哮',{v71Tags:['selfhurt','pain_gain','draw']});
v71PatchCard('qiu013','断骨踩踏',{v71Tags:['pain_payoff','gap_close','down']});
v71PatchSkill('qiu013','full_overload',{v71Tags:['chain_setup','selfhurt','attack_bonus']});
v71PatchUltimate('qiu013','frenzy_execute',{v71Tags:['finisher','pain_spend','status_payoff']});

// 白夜：少量牌承担阶段变形，避免全牌库三套效果。
v71PatchCard('baiye','水面借力',{v71Tags:['stage_shift','move_synergy','growth']});
v71PatchCard('baiye','羽轴新生',{v71Tags:['growth','heal','feather']});
v71PatchCard('baiye','终成白夜',{v71Tags:['stage_finisher','awake','draw']});
v71PatchSkill('baiye','lake_dance',{v71Tags:['growth','chain_setup','move_synergy']});
v71PatchUltimate('baiye','ice_finale',{v71Tags:['finisher','status_payoff','stage_payoff']});

// 岚羽：起飞—空中追击—选择落点—俯冲收尾。
v71PatchCard('lanyu','轻羽滑翔',{v71Tags:['enter_flying','draw','qi']});
v71PatchCard('lanyu','盘旋追击',{v71Tags:['air_chase','landing_choice','move_synergy']});
v71PatchCard('lanyu','高枝俯冲',{v71Tags:['dive','chain_finisher','landing']});
v71PatchSkill('lanyu','sky_cry',{v71Tags:['enter_flying','chain_setup','attack_bonus']});
v71PatchUltimate('lanyu','phoenix_shadow',{v71Tags:['finisher','fly_payoff','auto_end']});

// 游影：自主位移方向序列与“不移动也是选择”。
v71PatchCard('youying','借势回旋',{v71Tags:['move_payoff','rhythm','lateral']});
v71PatchCard('youying','游墙折返',{v71Tags:['move_choice','retreat','tactical_step']});
v71PatchCard('youying','游影封线',{v71Tags:['control','rhythm_setup','zone']});
v71PatchSkill('youying','swift_double',{v71Tags:['move_synergy','chain_setup','condition_bypass']});
v71PatchUltimate('youying','chaos_throat',{v71Tags:['finisher','status_payoff','auto_end']});

// 玄医：实际治疗/过量治疗转为进攻节奏。
v71PatchCard('xuanyi','回春追针',{v71Tags:['heal','medicine_momentum','gap_close']});
v71PatchCard('xuanyi','乌羽推拿',{condition:{any:['healed','hurt']},v71Tags:['heal_payoff','attack']});
v71PatchCard('xuanyi','守中藏针',{v71Tags:['counter_setup','medicine_momentum','reserve']});
v71PatchSkill('xuanyi','great_cycle',{v71Tags:['heal','chain_payoff','qi']});
v71PatchUltimate('xuanyi','life_needle',{v71Tags:['finisher','heal_payoff','auto_end']});

// 法尤姆：真实牌序事务已由Core提供；牌面统一标记牌序/预言/命线用途。
v71PatchCard('fayoum','太阳算式',{v71Tags:['deck_order','scry','prediction']});
v71PatchCard('fayoum','圣甲抽丝',{v71Tags:['deck_order','cycle','prediction']});
v71PatchCard('fayoum','法尤姆追咒',{v71Tags:['fate_line','range','chain']});
v71PatchSkill('fayoum','fate_leap',{v71Tags:['deck_order','draw','prediction']});
v71PatchUltimate('fayoum','endgame',{v71Tags:['finisher','fate_payoff','auto_end']});


const __default_data_heroes_js = HEROES;


// ==================== data/maps.js ====================
// ============================================================================
// V6 地图数据层 — 对应设计文档 V6_设计_02_地图经济
// 资源点分级 / 补给点冷却 / 缩域预告 / 地形实装
// ============================================================================

// 格子类型
const TILE = {
  FLOOR: 'floor',       // 普通地面
  OBSTACLE: 'obstacle', // 实体障碍（木箱，可破坏）
  WALL: 'wall',         // 实体墙/石柱（不可破坏）
  RESOURCE: 'resource', // 中央资源点
  SUPPLY: 'supply',     // 补给点
  HIGHLAND: 'highland', // 高地：远程+1，近战高打低首击+1伤
  BUSH: 'bush',         // 草丛：发出的首击不可被普通反击，攻击后暴露
  MUD: 'mud',           // 泥地：进入后本次移动立即结束
  DANGER: 'danger',     // 危险区（缩域）
  LOCKED: 'locked',     // 封锁区（缩域）
};

// 地形战斗价值（设计02 §5）
const TERRAIN_RULE = {
  highland: { rangedBonus: 1, meleeFirstHitBonus: 1, desc: '高地：远程距离+1；近战高打低本展开首击+1伤' },
  bush: { firstHitUncounterable: true, exposeAfterAttack: true, desc: '草丛：发出的本展开首击不可被普通反击，攻击后暴露' },
  mud: { endMoveOnEnter: true, desc: '泥地：进入后本次移动立即结束' },
};

// 缩域阶段（设计02 §2.2 + 文档14.2）
const SHRINK_STAGES = [
  { section: 1, desc: '完整5×5安全区', danger: [], locked: [] },
  { section: 2, desc: '外圈危险区', dangerRing: 1, locked: [] },      // 外圈结束展开受1伤
  { section: 3, desc: '外圈封锁', dangerRing: 0, lockedRing: 1 },     // 仅中央3×3
  { section: 4, desc: '中央十字', cross: true },                      // 仅十字5格
  { section: 5, desc: '持续加压', cross: true, escalate: true },      // 每大回合缩域伤+1
];

// 中央资源点分级奖励（设计02 §3）
const RESOURCE_TIERS = [
  { streak: 1, qi: 1, energy: 1, draw: 0, desc: '首次占据：1气+1能' },
  { streak: 2, qi: 2, energy: 1, draw: 0, desc: '连续2大回合：2气+1能' },
  { streak: 3, qi: 2, energy: 2, draw: 1, desc: '连续3+大回合：2气+2能+摸1' }, // [PLACEHOLDER 待验证]
];

// 补给点选项（设计02 §4 提值）
const SUPPLY_OPTIONS = [
  { id: 'heal', label: '回3生命', heal: 3 },
  { id: 'energy', label: '回2能量', energy: 2 },
  { id: 'draw', label: '摸3弃1', draw: 3, discard: 1 },
  { id: 'shield', label: '2层护盾', shield: 2 },
];

// 晴日农场 V6 地图定义
const MAP_SUNNY_FARM = {
  id: 'sunny_farm',
  name: '晴日农场',
  size: 5,
  playerStart: [5, 3],   // 行,列（1-indexed）
  enemyStart: [1, 3],
  resource: [3, 3],      // 中央资源点
  obstacles: [[2, 2], [2, 4], [4, 2], [4, 4]], // 十字通道障碍
  supplyCandidates: [[2, 3], [3, 4], [4, 3], [3, 2]], // 顺时针轮换
  // V6 地形实装（设计02 §5）
  terrain: {
    highland: [[2, 3], [4, 3]],  // 侧翼高地
    bush: [[3, 2], [3, 4]],      // 中央两侧草丛
    // 泥地：原坐标 [[2,2],[4,4]] 与障碍格完全重叠（障碍优先），导致泥地永不生效（死数据）。
    // 已挪到真正的地面格（上/下中央），让"进入即停"规则实际可触发。
    mud: [[1, 3], [5, 3]],       // 上中央 / 下中央泥潭
  },
};

// 建棋盘（返回 5×5 格子数组，每格 { type, terrain, x, y }）
function buildBoard(map = MAP_SUNNY_FARM) {
  const board = [];
  for (let r = 1; r <= map.size; r++) {
    for (let c = 1; c <= map.size; c++) {
      const cell = { row: r, col: c, type: TILE.FLOOR, terrain: null };
      // 障碍优先
      if (map.obstacles.some(([or, oc]) => or === r && oc === c)) cell.type = TILE.OBSTACLE;
      else if (map.resource[0] === r && map.resource[1] === c) cell.type = TILE.RESOURCE;
      // 地形（不与障碍/资源重叠）
      if (cell.type === TILE.FLOOR && map.terrain) {
        for (const [t, cells] of Object.entries(map.terrain)) {
          if (cells.some(([tr, tc]) => tr === r && tc === c)) { cell.terrain = t; break; }
        }
      }
      board.push(cell);
    }
  }
  return board;
}

// 计算某节下的缩域区域（返回 { danger:Set, locked:Set }，元素为 "r,c"）
// 命名注意：引擎侧 engine.js 另有同名内部函数 shrinkZone(state)（负责实际结算），
// 二者语义不同；本函数是纯数据层的「格子集合计算」，故命名为 shrinkZoneTiles 以免混淆/覆盖。
function shrinkZoneTiles(section, map = MAP_SUNNY_FARM) {
  const danger = new Set(), locked = new Set();
  const N = map.size;
  const key = (r, c) => `${r},${c}`;
  if (section >= 4) {
    // 仅中央十字5格安全，其余封锁
    const cross = new Set([key(3, 3), key(2, 3), key(4, 3), key(3, 2), key(3, 4)]);
    for (let r = 1; r <= N; r++) for (let c = 1; c <= N; c++) if (!cross.has(key(r, c))) locked.add(key(r, c));
  } else if (section === 3) {
    // 外圈封锁，仅中央3×3
    for (let r = 1; r <= N; r++) for (let c = 1; c <= N; c++) {
      if (r === 1 || r === N || c === 1 || c === N) locked.add(key(r, c));
    }
  } else if (section === 2) {
    // 外圈危险
    for (let r = 1; r <= N; r++) for (let c = 1; c <= N; c++) {
      if (r === 1 || r === N || c === 1 || c === N) danger.add(key(r, c));
    }
  }
  return { danger, locked };
}

// 资源点分级：根据连续占据大回合数返回奖励档位
function resourceTier(streak) {
  if (streak >= 3) return RESOURCE_TIERS[2];
  if (streak === 2) return RESOURCE_TIERS[1];
  return RESOURCE_TIERS[0];
}

const __default_data_maps_js = { TILE, TERRAIN_RULE, SHRINK_STAGES, RESOURCE_TIERS, SUPPLY_OPTIONS, MAP_SUNNY_FARM, buildBoard, shrinkZoneTiles, resourceTier };


// ==================== engine/index.js ====================
// ============================================================================
// V6 引擎 — 入口
// 提供 newGame 与公开 API；所有公开操作走事务（clone→结算→提交/回滚）
// ============================================================================







// ---------------------------------------------------------------------------
// 地形棋盘适配器：maps.js 扁平棋盘（1-based {row,col,type,terrain}）→ 引擎 2D 棋盘
// ---------------------------------------------------------------------------

/**
 * 把 maps.js 的 buildBoard 结果转换成引擎使用的 2D 棋盘。
 * 引擎 cell = { obstacle, zone, terrain }；maps.js cell = { row, col, type, terrain }（1-based）。
 * 坐标全部转 0-based。地形仅在 cell.terrain 为真值时生效，默认棋盘 terrain:null 不受影响。
 * @param {object} map MAP_SUNNY_FARM 等
 * @returns {object} 引擎棋盘（含 terrain / resource / supplyRotation）
 */
function buildTerrainBoard(map = MAP_SUNNY_FARM) {
  if(map==='terraced_arena_9x9'||map?.id==='terraced_arena_9x9'){
    const M=HEX_MAP_DATA,N=9,cells=Array.from({length:N},()=>Array.from({length:N},()=>({exists:false,walkable:false,obstacle:true,zone:false,danger:false,terrain:null,height:0,neighborsByDir:{}})));
    for(const [label,c] of Object.entries(M.cells)){
      const by={};for(const e of c.neighbors){const t=M.cells[e.to];by[e.dir]={...e,row:t.row,col:t.col};}
      cells[c.row][c.col]={exists:true,label,row:c.row,col:c.col,q:c.q,axialR:c.r,walkable:c.walkable,obstacle:c.obstacle,zone:true,danger:false,terrain:c.terrain,height:c.height,ring:c.ring,blocksLOS:c.blocksLOS,neighborsByDir:by};
    }
    const at=(label)=>{const c=M.cells[label];return {r:c.row,c:c.col,label};};
    return {size:N,cells,hex:true,mapId:M.id,mapName:M.name,resource:at(M.resourcePoints[0]),supplyRotation:M.supplyPoints.map(at),shrinkStages:M.shrinkStages,terrain:true};
  }
  const flat=buildBoard(map),N=map.size,cells=[];for(let r=0;r<N;r++){const row=[];for(let c=0;c<N;c++)row.push({exists:true,walkable:true,obstacle:false,zone:true,danger:false,terrain:null,height:0});cells.push(row);}
  for(const cell of flat){const r=cell.row-1,c=cell.col-1;if(cell.type===TILE.OBSTACLE||cell.type===TILE.WALL)cells[r][c].obstacle=true;cells[r][c].terrain=cell.terrain||null;}
  return {size:N,cells,resource:{r:map.resource[0]-1,c:map.resource[1]-1},supplyRotation:map.supplyCandidates.map(([r,c])=>({r:r-1,c:c-1})),terrain:true};
}

// ---------------------------------------------------------------------------
// newGame
// ---------------------------------------------------------------------------

/**
 * 初始化对局。
 * @param {string} heroAId 角色A id（heroes.js 键）
 * @param {string} heroBId 角色B id
 * @param {object} [options] { first:0|1, seed }
 * @returns {object} GameState
 */
function newGame(heroAId, heroBId, options = {}) {
  const heroA = HEROES[heroAId];
  const heroB = HEROES[heroBId];
  if (!heroA) throw new Error(`未知角色：${heroAId}`);
  if (!heroB) throw new Error(`未知角色：${heroBId}`);

  // 启动自检：所有卡牌效果必须已注册
  validateRegistry(HEROES);

  // 真实引擎随机性必须由 seed 驱动。未传 seed 时只在这里生成一次随机种子；
  // 此后牌序、弃牌、重洗全部使用 state.rngState，保证模拟可复现且事务可回滚。
  const seed = options.seed ?? Math.floor(Math.random() * 0x100000000);
  // 地形默认关闭：只有显式传入 options.map 才构建含地形棋盘。
  // 默认（无 map）走 makeBoard() 的 terrain:null 占位，65 个引擎测试零影响。
  const board = options.map ? buildTerrainBoard(options.map) : null;
  const state = makeGameState(heroA, heroB, { first: options.first ?? 0, seed, board });
  if(board?.hex){ const a=HEX_MAP_DATA.cells[HEX_MAP_DATA.spawns.A],b=HEX_MAP_DATA.cells[HEX_MAP_DATA.spawns.B];state.players[0].pos={r:a.row,c:a.col};state.players[1].pos={r:b.row,c:b.col}; }
  if (options.first == null) { const randomizedFirst = random(state) < 0.5 ? 0 : 1; setMainActionSide(state, randomizedFirst, 'random_first'); }
  const first = ruleMainActionSide(state); state.mainTurnOwner=first; state.initiativeSide=first; state.turn=first;

  // 每个角色 15 张牌用同一对局 PRNG 洗成牌堆
  state.players[0].deck = shuffle(
    heroA.cards.map((c, i) => ({ ...c, owner: heroAId, instanceId: `A:${heroAId}:${i}`, counterSuccess: c.counterSuccess === true || (c.type === 'counter' && ['evade','guard','guardqi'].includes(c.effect)) })), state,
  );
  state.players[1].deck = shuffle(
    heroB.cards.map((c, i) => ({ ...c, owner: heroBId, instanceId: `B:${heroBId}:${i}`, counterSuccess: c.counterSuccess === true || (c.type === 'counter' && ['evade','guard','guardqi'].includes(c.effect)) })), state,
  );

  // 初始抽5：统一计入命运编织，这是开局资源的真实状态。
  drawCards(state, 0, CONST.START_HAND);
  drawCards(state, 1, CONST.START_HAND);

  state.phase = PHASE.PRE_ATTACK;
  state.log.push({ type: 'game_start', first, heroA: heroAId, heroB: heroBId });
  return state;
}

// ---------------------------------------------------------------------------
// 绝技合法性（单一真源：UI / AI / 执行均复用）
// ---------------------------------------------------------------------------

/**
 * 返回绝技当前不可用原因；null 表示可用。
 * 不能只在 useUltimate 执行时才报错，否则 UI/AI 会拿到“伪合法动作”，
 * 反复尝试失败并浪费整次展开。
 */
function ultimateValidationError(state, side, ult) {
  const p = state.players[side];
  const def = state.players[1 - side];
  const d = dist(p.pos, def.pos);
  const meleeUltimates = new Set([
    'ten_sec_kill', 'frenzy_execute', 'ice_finale',
    'chaos_throat', 'life_needle', 'endgame',
  ]);
  if (meleeUltimates.has(ult.id) && d > CONST.MELEE_RANGE) {
    return `${ult.name}需相邻目标`;
  }
  // 冰面终曲/乱步封喉是追击终结技：条件由本连击制造，必须允许在 CHASE_WINDOW 发动。
  if (['ice_finale', 'chaos_throat'].includes(ult.id)
      && state.phase !== PHASE.PRE_ATTACK
      && state.phase !== PHASE.CHASE_WINDOW) {
    return `${ult.name}只能在攻击前或追击窗口使用`;
  }
  if (ult.needFly && !p.statusSlots.persistent.some((s) => s.id === PERSISTENT.FLYING)) {
    return `${ult.name}需处于飞行`;
  }
  if (ult.needStatus) {
    const hasBad = getPosture(def) !== POSTURE.NORMAL
      || def.statusSlots.control.length > 0
      || def.statusSlots.persistent.some((s) => [PERSISTENT.BURN, PERSISTENT.POISON, PERSISTENT.FROZEN].includes(s.id));
    if (!hasBad) return `${ult.name}需目标有异常状态`;
  }
  if (ult.needDownOrStiff || ult.needDownStiffOrAir) {
    const posture = def.statusSlots.posture?.id;
    const downed = posture === POSTURE.DOWNED;
    const airborne = posture === POSTURE.AIRBORNE;
    const stiff = def.statusSlots.control.some((s) => s.id === CONTROL.STIFF);
    if (!downed && !stiff && !(ult.needDownStiffOrAir && airborne)) {
      return `${ult.name}需目标倒地、僵直${ult.needDownStiffOrAir ? '或浮空' : ''}`;
    }
  }
  if(ult.chainMin){const n=state.chain.filter(x=>!x.cardType||x.cardType==='attack').length;if(n<ult.chainMin)return `${ult.name}需本链至少已有${ult.chainMin}击`}
  if(ult.cardsPlayedMin&&v7LedgerValue(state,side,'cardsPlayed')<ult.cardsPlayedMin)return `${ult.name}需本展开已打出至少${ult.cardsPlayedMin}张牌`;
  if(ult.requiresHealed&&v7LedgerValue(state,side,'healed')<=0)return `${ult.name}需本展开治疗过`;
  if(ult.requiresChainStatus&&!state.chain.some(x=>(x.statusApplied||[]).length>0))return `${ult.name}需本连击制造异常状态`;
  return null;
}

// ---------------------------------------------------------------------------
// getLegalActions
// ---------------------------------------------------------------------------

/**
 * 查询当前时点的合法操作。
 * @param {object} state
 * @returns {{phase:string, actions:string[], cards:object[], canEnd:boolean}}
 */
function getLegalActions(state) {
  const phase = state.phase;
  const side = ruleActorSide(state);
  const p = state.players[side];
  const actions = PHASE_ACTIONS[phase] || [];
  const out = { phase, actions: [], cards: [], canEnd: false };

  if (state.winner != null) return out;

  if (phase === PHASE.PRE_ATTACK) {
    out.actions = actions.slice();
    out.canEnd = true;
    // 可打出的牌：费用够、类型在合法列表
    out.cards = p.hand.filter((c) => {
      const cost=computeCost(state,side,c,false);
      if(cost>p.energy)return false;
      if(c.oncePerExpansion&&p.mechanics[c.oncePerExpansion])return false;
      if(c.requiresSelfHurtOrDamage&&!(expansionHistoryFact(state,side,'selfDamage')>0||expansionHistoryFact(state,side,'hpLost')>0))return false;
      if(c.condition&&c.type!=='attack'){
        const ok=checkCondition(c.condition,{state,attacker:side,defender:1-side,card:c,lastLog:state.chain[state.chain.length-1]||null});
        if(!ok)return false;
      }
      if (c.type === 'attack' && (c.timing === 'starter' || c.modes?.active || c.allowActive)) {
        if (!actions.includes('starter')) return false;
        if (v7LedgerValue(state,side,'attacksResolved') >= CONST.MAX_ATTACKS) return false;
        const defender=state.players[1-side],range=effectiveRange(state,side,c);
        if(dist(p.pos,defender.pos)<=range)return true;
        return !!p.mechanics.lafengRiposteReady&&canBridgeToRange(state,side,1,range);
      }
      if (c.type === 'move') return actions.includes('move');
      if (c.type === 'buff') return actions.includes('buff');
      if (c.type === 'resource') return actions.includes('resource');
      if (c.type === 'control') return actions.includes('control');
      if (c.type === 'heal') {
        if (p.hero.id === 'xuanyi' && p.mechanics.activeHealUsedThisExpansion) return false;
        return actions.includes('heal');
      }
      if (c.type === 'state') return actions.includes('state');
      return false;
    });
    // 六方向战术步：同时返回实际目标格，UI与AI都不再猜方向。
    out.tacticalStepDirs=[];out.tacticalStepTargets={};out.tacticalStepPaths=[];
    if(!p.mechanics.tacticalStepUsed&&!hasStatus(p,CONTROL.ROOTED)){
      const budget=(p.hero.id==='baiye'&&p.mechanics.awakened?2:1)+(p.mechanics.baiyeWaterMoveArmed?1:0);
      out.tacticalStepPaths=getReachableMovePaths(state,side,budget);
      for(const item of out.tacticalStepPaths){const dir=edgeForMove(state,p.pos,item.path[0])?.dir||'path';if(!out.tacticalStepDirs.includes(dir))out.tacticalStepDirs.push(dir);out.tacticalStepTargets[dir]=item.dest}
    }
    out.tacticalStepAvailable=out.tacticalStepPaths.length>0;
    // 技能：费用、限次与特殊前置条件都在同一规则真源中筛选。
    out.skills = (p.hero.skills || []).filter((skill) => skillValidationError(state, side, skill) === null);
    // 玄医回春：每大回合1次，2气回2；与主动恢复牌共享每展开1次额度。
    out.canRejuvenate = p.hero.id === 'xuanyi'
      && p.qi >= 2
      && p.mechanics.rejuvenateLastRound !== state.round
      && !p.mechanics.activeHealUsedThisExpansion;
    // 绝技：资源、次数、距离与角色前置必须全部满足。
    // getLegalActions 列出的动作必须能直接执行，不能把条件校验甩给 UI/AI 猜。
    out.ultimates = (p.hero.ultimates || []).filter(
      (u) => p.qi >= u.qi
        && !p.ultimatesUsed.includes(u.id)
        && ultimateValidationError(state, side, u) === null,
    );
  } else if (phase === PHASE.CHASE_WINDOW) {
    out.actions = actions.slice();
    out.canEnd = true;
    const lastLog = state.chain[state.chain.length - 1] || null;
    out.cards = p.hand.filter((c) => {
      if (c.type !== 'attack' || !(c.timing === 'follow' || c.modes?.follow)) return false;
      if (!(c.modes?.follow?.condition ?? c.condition)) return false;
      const ok = checkCondition(c.modes?.follow?.condition ?? c.condition, {
        state, attacker: side, defender: 1 - side, card: c, lastLog,
      });
      if(!ok&&!p.mechanics.swiftDouble&&!p.mechanics.lafengSeizeFollow)return false;
      if (v7LedgerValue(state,side,'attacksResolved') >= CONST.MAX_ATTACKS) return false;
      if (state.chain.length >= CONST.MAX_FOLLOW + 1) return false;
      const defender=state.players[1-side];
      let bridge=0;
      if(p.mechanics.followStepAvailable>0)bridge=Math.max(bridge,p.mechanics.followStepAvailable);
      if(c.preMoveToward)bridge=Math.max(bridge,c.preMoveToward);
      if(c.preMoveIfHealed&&expansionHistoryFact(state,side,'healed')>0)bridge=Math.max(bridge,c.preMoveIfHealed);
      if(c.preMoveIfLastRanged){
        const prev=state.chain[state.chain.length-1];
        const prevCard=prev?p.hero.cards.find(x=>x.name===prev.cardName||x.artKey===prev.cardName):null;
        if(prevCard&&(prevCard.range||0)>CONST.MELEE_RANGE)bridge=Math.max(bridge,c.preMoveIfLastRanged);
      }
      const range=effectiveRange(state,side,c);
      if(dist(p.pos,defender.pos)>range&&(!bridge||!canBridgeToRange(state,side,bridge,range)))return false;
      const cost = computeCost(state, side, c, true);
      return cost <= p.energy;
    });
    // 追击终结绝技：白夜“冰面终曲”与游影“乱步封喉”。
    // 条件在本连击中制造，不能等到下一展开。
    out.ultimates = (p.hero.ultimates || []).filter(
      (u)=>u.chaseFinisher
        && p.qi>=u.qi
        && !p.ultimatesUsed.includes(u.id)
        && ultimateValidationError(state, side, u) === null,
    );
  } else if (phase === PHASE.RESPONSE_WINDOW) {
    // 对手操作
    const defSide = 1 - state.pendingCard.attackerSide;
    const def = state.players[defSide];
    const incoming = state.pendingCard.card;
    out.actions = actions.slice();
    // 草丛首击不可被反击：防守方本时点没有合法反击牌（仍可普通挣脱）
    if (state.pendingCard.bushUncounterable || state.pendingCard.stiffBlocksCounter) {
      out.cards = [];
    } else {
    out.cards = def.hand.filter((c) => {
      if (c.type !== 'counter') return false;
      if (hasStatus(def, CONTROL.SEALED)) return false;
      // 反击条件
      const ok = checkCondition(c.condition || CONDITION.ANY, {
        state, attacker: defSide, defender: state.pendingCard.attackerSide,
        card: c, lastLog: null,
      });
      if (!ok) return false;
      // 距离：反击牌 range 需覆盖
      const d = dist(def.pos, state.players[state.pendingCard.attackerSide].pos);
      if (c.range > 0 && d > c.range) return false;
      const cost = computeCost(state, defSide, c, false);
      return cost <= def.energy;
    });
    }
    out.canStruggle = !state.pendingCard.opts?.isUltimate && def.qi >= 2 && (def.mechanics.struggleUsesThisSection||0) < 1;
    out.canRiskyStruggle = !state.pendingCard.opts?.isUltimate && !def.mechanics.riskyStruggleUsedThisExpansion;
  } else if (phase === PHASE.EXPANSION_END) {
    out.actions = actions.slice();
    out.canBurstStruggle = true; // 惊险挣脱
  } else if (phase === PHASE.SUPPLY_CHOICE) {
    // 补给四选一：heal/energy/draw/shield
    out.actions = actions.slice();
  }
  return out;
}

// ---------------------------------------------------------------------------
// 技能合法性（单一真源）
// ---------------------------------------------------------------------------

/**
 * 技能实际费用（单一真源：校验与扣费都读这里）。
 * 岚羽永翔之魂：sky_hunt / sky_cry 是进飞行技能，本大回合首次进飞行费用0。
 * 额度消费统一在 enterFlying，本函数只做费用预览，不记账。
 */
function skillCost(state, side, skill) {
  if (['sky_hunt', 'sky_cry'].includes(skill.id) && lanyuFreeFlyAvailable(state, side)) {
    return 0;
  }
  return skill.cost;
}

function skillValidationError(state, side, skill) {
  const p = state.players[side];
  if (state.phase !== PHASE.PRE_ATTACK) return '当前不能使用技能';
  if (ruleInitiativeSide(state) !== side) return '无进攻权';
  const cost = skillCost(state, side, skill);
  if (p.energy < cost) return `能量不足：需 ${cost}`;
  if (skill.limit === 'round' && p.mechanics.skillLastRound?.[skill.id] === state.round) {
    return `${skill.name} 本大回合已用`;
  }
  if (skill.limit === 'section' && p.mechanics.skillLastSection?.[skill.id] === state.section) {
    return `${skill.name} 本节已用`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// playCard（起手/追击/非攻击牌）
// ---------------------------------------------------------------------------

/**
 * 打出一张牌。
 * @param {object} state
 * @param {number} side
 * @param {string} cardName 手牌中的牌名
 * @param {object} [opts] { isFollow }
 * @returns {{ok:boolean, state:object, result?:object, error?:string}}
 */
function playCard(state, side, cardName, opts = {}) {
  return transact(state, (draft) => {
    const p = draft.players[side];
    const card = p.hand.find((c) => c.name === cardName);
    if (!card) throw new Error(`手牌中没有 "${cardName}"`);

    const phase = draft.phase;
    if(card.type==='heal'&&p.hero.id==='xuanyi'&&p.mechanics.activeHealUsedThisExpansion){
      throw new Error('本展开已使用主动恢复牌或回春');
    }
    if(card.oncePerExpansion&&p.mechanics[card.oncePerExpansion])throw new Error(`${card.name}本展开已使用`);
    if(card.requiresSelfHurtOrDamage&&!(v7LedgerValue(draft,side,'selfDamage')>0||v7LedgerValue(draft,side,'hpLost')>0)){
      throw new Error(`${card.name}需要本展开曾自伤或受伤`);
    }
    if(card.condition&&card.type!=='attack'){
      const ok=checkCondition(card.condition,{
        state:draft,attacker:side,defender:1-side,card,
        lastLog:draft.chain[draft.chain.length-1]||null,
      });
      if(!ok)throw new Error(`${card.name}条件不满足：${card.condition}`);
    }
    if (opts.isFollow) {
      if (phase !== PHASE.CHASE_WINDOW) throw new Error('当前不在追击窗口');
      if (card.type !== 'attack' || !(card.timing === 'follow' || card.modes?.follow)) {
        throw new Error(`${cardName} 不是追击牌`);
      }
    } else {
      if (phase !== PHASE.PRE_ATTACK) throw new Error('当前不在攻击前行动时点');
      if (card.type === 'attack' && !(card.timing === 'starter' || card.modes?.active || card.allowActive)) {
        throw new Error(`${cardName} 不能作起手`);
      }
      if (card.type === 'counter') throw new Error('反击牌只能在响应窗口使用');
    }
    const log = resolveCard(draft, side, card, { ...opts, isFollow: !!opts.isFollow });
    return log;
  });
}

// ---------------------------------------------------------------------------
// tacticalStep（免费战术步）
// ---------------------------------------------------------------------------

/**
 * 免费战术步：向指定方向移动1格。每展开1次。
 * @param {object} state
 * @param {number} side
 * @param {string} dir 'up'|'down'|'left'|'right'
 */
function tacticalStep(state,side,dir,opts={}){
  return transact(state,draft=>{if(draft.phase!==PHASE.PRE_ATTACK)throw new Error('当前不能战术步');if(ruleInitiativeSide(draft)!==side)throw new Error('无进攻权');
    const p=draft.players[side];if(p.mechanics.tacticalStepUsed)throw new Error('本展开战术步已用');if(hasStatus(p,CONTROL.ROOTED))throw new Error('被禁步，不能战术步');
    const budget=(p.hero.id==='baiye'&&p.mechanics.awakened?2:1)+(p.mechanics.baiyeWaterMoveArmed?1:0),before={...p.pos};
    if(Array.isArray(opts.movePath)&&opts.movePath.length)applySelectedMovePath(draft,side,opts.movePath,budget);
    else{if(!HEX_DIRS[dir])throw new Error(`非法六边方向：${dir}`);const n=hexStep(draft,p.pos,dir);if(!n||!canTraverse(draft,p.pos,n)||(draft.players[1-side].pos.r===n.r&&draft.players[1-side].pos.c===n.c))throw new Error('目标方向不可行走');p.pos=n}
    if(before.r===p.pos.r&&before.c===p.pos.c)throw new Error('没有完成移动');finalizeMoveMechanics(draft,side,before);p.mechanics.tacticalStepUsed=true;
    draft.log.push({type:'tactical_step',side,dir:dir||'path',path:opts.movePath||null});return {r:p.pos.r,c:p.pos.c};
  });
}

// ---------------------------------------------------------------------------
// useSkill（耗能技能）
// ---------------------------------------------------------------------------

/**
 * 使用技能。
 * @param {object} state
 * @param {number} side
 * @param {string} skillId
 */
function useSkill(state,side,skillId,opts={}) {
  return transact(state, (draft) => {
    if (draft.phase !== PHASE.PRE_ATTACK) throw new Error('当前不能使用技能');
    if (ruleInitiativeSide(draft) !== side) throw new Error('无主动权');
    const p = draft.players[side];
    const skill = (p.hero.skills || []).find((s) => s.id === skillId);
    if (!skill) throw new Error(`角色没有技能 "${skillId}"`);
    const validationError = skillValidationError(draft, side, skill);
    if (validationError) throw new Error(validationError);

    p.mechanics.skillUsage = p.mechanics.skillUsage || {};
    p.mechanics.skillLastRound = p.mechanics.skillLastRound || {};
    p.mechanics.skillLastSection = p.mechanics.skillLastSection || {};
    const used = p.mechanics.skillUsage[skillId] || 0;

    p.energy -= skillCost(draft, side, skill);
    p.mechanics.skillUsage[skillId] = used + 1;
    p.mechanics.skillLastRound[skillId] = draft.round;
    p.mechanics.skillLastSection[skillId] = draft.section;

    // 技能效果（按 id 分发）
    applySkill(draft,side,skillId,opts);
    draft.log.push({ type: 'skill', side, skillId });
    return skill;
  });
}

/** 技能效果实现。 */
function applySkill(state,side,skillId,opts={}) {
  const p = state.players[side];
  switch (skillId) {
    // 洛基
    case 'champ_round': p.mechanics.championRoundLeft = 3; break;
    case 'hell_train': heal(state, side, 3); drawCards(state, side, 2); break;
    case 'corner_storm': p.mechanics.cornerStorm = true; break;
    // 赤羽
    case 'sun_dance': p.mechanics.sunDance = true; break;
    case 'ancestral_hunt': p.mechanics.ancestralHuntOn = 1 - side; break;
    case 'blood_totem': damage(state, side, 2, 'blood_totem', { isSelf: true }); p.mechanics.bloodTotem = true; break;
    // 拉封
    case 'duel_oath': p.mechanics.duelOath = true; break;
    case 'glory_call': p.mechanics.gloryCall = true; break;
    case 'curtain_call': p.mechanics.curtainCall = true; break;
    // 囚徒013
    case 'full_overload': p.mechanics.fullOverload = true; break;
    case 'bio_molt': {
      p.statusSlots.control = [];
      p.statusSlots.persistent = p.statusSlots.persistent.filter(
        (s) => !['burn', 'poison', 'frozen'].includes(s.id),
      );
      heal(state, side, 4);
      break;
    }
    case 'hormone_tide': p.mechanics.qiuHormoneArmed = true; break;
    // 白夜
    case 'chick_guard': p.mechanics.chickGuard = true; break;
    case 'cocoon_form': gainFeather(state, side, 2); drawCards(state, side, 2); break;
    case 'lake_dance': p.mechanics.lakeDance = true; break;
    // 岚羽
    case 'sky_hunt':
      enterFlying(state, side, 'sky_hunt');
      p.mechanics.skyHunt = true;
      break;
    case 'gale_net': {
      const def = state.players[1 - side];
      setPostureSafe(state, 1 - side, 'airborne', 'gale_net');
      def.statusSlots.control.push({ id: 'rooted', source: 'gale_net', stacks: 1, remainingTriggers: null, meta: {} });
      break;
    }
    case 'sky_cry':
      enterFlying(state, side, 'sky_cry');
      p.mechanics.lanyuCryArmed = true;
      break;
    // 游影
    case 'flow_break': p.mechanics.flowBreak = true; break;
    case 'swift_double':{if(Array.isArray(opts.movePath)&&opts.movePath.length){const m=applySelectedMovePath(state,side,opts.movePath,2);finalizeMoveMechanics(state,side,m.origin)}else moveToward({state,attacker:side,defender:1-side},2);p.mechanics.swiftDouble=true;break}
    case 'light_breath':{if(Array.isArray(opts.movePath)&&opts.movePath.length){const m=applySelectedMovePath(state,side,opts.movePath,1);finalizeMoveMechanics(state,side,m.origin)}else moveToward({state,attacker:side,defender:1-side},1);const def=state.players[1-side];p.energy=Math.min(CONST.ENERGY_MAX,p.energy+1);def.energy=Math.max(CONST.ENERGY_DRAIN_FLOOR,def.energy-1);break}
    // 玄医
    case 'herb_revive': {
      p.statusSlots.control = [];
      p.statusSlots.persistent = p.statusSlots.persistent.filter(
        (s) => !['burn', 'poison', 'frozen'].includes(s.id),
      );
      heal(state, side, 4);
      break;
    }
    case 'great_cycle': p.mechanics.greatCycle = true; break;
    case 'defense_offense': p.mechanics.xuanyiDefArmed = true; break;
    // 法尤姆
    case 'fate_leap': {
      // 显式技能收益只有“洗牌1 + 获得1命运”；随后抽5产生的命运由公共命运编织统一记账。
      reshuffle(state, side);
      drawCards(state, side, 5);
      break;
    }
    case 'tomb_strip': discardRandom(state, 1 - side, 2); break;
    case 'star_calc': p.mechanics.discountNext = (p.mechanics.discountNext || 0) + 1; break;
    default: throw new Error(`技能 "${skillId}" 未实现`);
  }
}

// --- 技能辅助（进化羽/命运/洗牌/状态安全施加） ---
function gainFeather(state, side, n) {
  return gainBaiyeFeather(state, side, n);
}
function gainFate(state, side, n) {
  const p = state.players[side];
  p.mechanics.fate = (p.mechanics.fate || 0) + n;
}
function reshuffle(state, side) {
  const p = state.players[side];
  p.deck = p.deck.concat(p.discard);
  p.discard = [];
  for (let i = p.deck.length - 1; i > 0; i--) {
    const j = Math.floor(random(state) * (i + 1));
    [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]];
  }
  p.mechanics.shuffleCount = (p.mechanics.shuffleCount || 0) + 1;
  if (p.hero.mechanics.some((m) => m.id === 'fate_weave')) gainFate(state, side, 1);
}
function addStatusSafe(state, side, id, source) {
  state.players[side].statusSlots.persistent.push({ id, source, stacks: 1, remainingTriggers: null, meta: {} });
}
function setPostureSafe(state, side, posture, source) {
  state.players[side].statusSlots.posture = { id: posture, source, stacks: 1, remainingTriggers: null, meta: {} };
}

/** 玄医常驻机制·回春：每大回合1次，付2气回2；与主动恢复牌共享展开额度。 */
function useRejuvenate(state, side) {
  return transact(state, (draft) => {
    if (draft.phase !== PHASE.PRE_ATTACK || ruleInitiativeSide(draft) !== side) throw new Error('当前不能使用回春');
    const p = draft.players[side];
    if (p.hero.id !== 'xuanyi') throw new Error('只有玄医能使用回春');
    if (p.mechanics.rejuvenateLastRound === draft.round) throw new Error('本大回合已使用回春');
    if (p.mechanics.activeHealUsedThisExpansion) throw new Error('本展开已使用主动恢复牌或回春');
    if (p.qi < 2) throw new Error('气不足：回春需2气');
    p.qi -= 2;
    p.mechanics.rejuvenateLastRound = draft.round;
    p.mechanics.activeHealUsedThisExpansion = true;
    const restored = heal(draft, side, 2);
    draft.log.push({ type: 'rejuvenate', side, restored });
    return { restored };
  });
}

// ---------------------------------------------------------------------------
// useUltimate（绝技）
// ---------------------------------------------------------------------------

/**
 * 使用绝技。绝技不能被反击，但可被惊险挣脱终止。
 * @param {object} state
 * @param {number} side
 * @param {string} ultId
 */
function useUltimate(state, side, ultId) {
  return transact(state, (draft) => {
    const candidate=(draft.players[side].hero.ultimates||[]).find(u=>u.id===ultId);
    const chaseFinisher=!!candidate?.chaseFinisher&&draft.phase===PHASE.CHASE_WINDOW;
    if (draft.phase !== PHASE.PRE_ATTACK && !chaseFinisher) throw new Error('当前不能使用绝技');
    if (ruleInitiativeSide(draft) !== side) throw new Error('无进攻权');
    const p = draft.players[side];
    const ult = (p.hero.ultimates || []).find((u) => u.id === ultId);
    if (!ult) throw new Error(`角色没有绝技 "${ultId}"`);
    if (p.ultimatesUsed.includes(ultId)) throw new Error(`${ult.name} 已使用`);
    if (p.qi < ult.qi) throw new Error(`气不足：需 ${ult.qi}`);
    const validationError = ultimateValidationError(draft, side, ult);
    if (validationError) throw new Error(validationError);

    p.qi -= ult.qi;
    p.ultimatesUsed.push(ultId);

    const def = draft.players[1 - side];
    const d = dist(p.pos, def.pos);

    // 绝技效果（按 id 分发）
    let dmg = ult.damage || 0;
    if (ultId === 'ten_sec_kill') {
      if (d > CONST.MELEE_RANGE) throw new Error('十秒绝杀需相邻目标');
      if (def.hp <= ult.executeHp) dmg = ult.executeDamage;
      damage(draft, 1 - side, dmg, ult.name);
    } else if (ultId === 'crown_skysurge') {
      // 突进2 + 5伤 + 击退2
      for(let i=0;i<(ult.dash||0);i++){const next=hexBestToward(draft,p.pos,def.pos,def.pos);if(!next)break;p.pos={r:next.r,c:next.c};}
      damage(draft, 1 - side, dmg, ult.name);
      // 击退2（简化：直接调 knockback 逻辑）
      const fakeCtx = {
        state: draft, attacker: side, defender: 1 - side,
        card: { name: ult.name }, log: { statusApplied: [], note: '', bonuses: [] },
      };
      knockback(fakeCtx,ult.knock||0);
    } else if (ultId === 'lance_charge') {
      // 突进2 + 5伤，命中后开追击
      for(let i=0;i<(ult.dash||0);i++){const next=hexBestToward(draft,p.pos,def.pos,def.pos);if(!next)break;p.pos={r:next.r,c:next.c};}
      damage(draft, 1 - side, dmg, ult.name);
      // Phase 4 fuzz closure: 绝技直接开启追击时必须先建立展开账本与主动权事实源。
      if (ult.openChase) { ensureExpansion(draft, side); draft.phase = PHASE.CHASE_WINDOW; }
    } else if (ultId === 'frenzy_execute') {
      // 狂噬处刑：对异常目标7伤（需目标有异常状态）
      if (d > CONST.MELEE_RANGE) throw new Error('狂噬处刑需相邻目标');
      const hasBad = getPosture(def) !== POSTURE.NORMAL
        || def.statusSlots.control.length > 0
        || def.statusSlots.persistent.some((s) => [PERSISTENT.BURN, PERSISTENT.POISON, PERSISTENT.FROZEN].includes(s.id));
      if (!hasBad) throw new Error('狂噬处刑需目标有异常状态');
      damage(draft, 1 - side, dmg, ult.name);
    } else if (ultId === 'ice_finale') {
      // 冰面终曲：对异常目标6伤；觉醒后再弃其1牌
      if (d > CONST.MELEE_RANGE) throw new Error('冰面终曲需相邻目标');
      const hasBad = getPosture(def) !== POSTURE.NORMAL
        || def.statusSlots.control.length > 0
        || def.statusSlots.persistent.some((s) => [PERSISTENT.BURN, PERSISTENT.POISON, PERSISTENT.FROZEN].includes(s.id));
      if (!hasBad) throw new Error('冰面终曲需目标有异常状态');
      damage(draft, 1 - side, dmg, ult.name);
      if (p.mechanics.awakened) discardRandom(draft, 1 - side, 1);
    } else if (ultId === 'phoenix_shadow') {
      // 凤冠绝影：飞行中对目标8伤
      const flying = p.statusSlots.persistent.some((s) => s.id === 'flying');
      if (!flying) throw new Error('凤冠绝影需处于飞行');
      damage(draft, 1 - side, dmg, ult.name);
    } else if (ultId === 'chaos_throat') {
      // 乱步封喉：对倒地、僵直或浮空目标7伤（V6 R1 放宽含浮空）
      if (d > CONST.MELEE_RANGE) throw new Error('乱步封喉需相邻目标');
      const downed = def.statusSlots.posture?.id === 'downed';
      const stiff = def.statusSlots.control.some((s) => s.id === 'stiff');
      const air = def.statusSlots.posture?.id === 'airborne';
      if (!downed && !stiff && !air) throw new Error('乱步封喉需目标倒地、僵直或浮空');
      damage(draft, 1 - side, dmg, ult.name);
    } else if (ultId === 'life_needle') {
      // 借寿针：目标5伤；本展开治疗过则+1
      if (d > CONST.MELEE_RANGE) throw new Error('借寿针需相邻目标');
      let final = dmg;
      if (v7LedgerValue(draft,side,'healed') > 0) final += (ult.healedBonus || 0);
      damage(draft, 1 - side, final, ult.name);
    } else if (ultId === 'endgame') {
      // 终局降临：5命运时7伤，否则5伤并得1命运
      if (d > CONST.MELEE_RANGE) throw new Error('终局降临需相邻目标');
      const fate = p.mechanics.fate || 0;
      if (fate >= (ult.fateThreshold || 5)) {
        damage(draft, 1 - side, ult.fateDamage || 7, ult.name);
      } else {
        damage(draft, 1 - side, dmg, ult.name);
        p.mechanics.fate = fate + 1;
      }
    } else {
      throw new Error(`绝技 "${ultId}" 未实现`);
    }

    // 击倒检查 / 追击终结：乱步封喉结算后自动收势，完成“造状态→终结技”闭环。
    draft.log.push({ type: 'ultimate', side, ultId, damage: dmg });
    if (def.hp <= 0) {
      draft.winner = side;
      draft.phase = PHASE.GAME_OVER;
    } else if (chaseFinisher) {
      expansionEndPipeline(draft, { voluntary: false, reason: 'chase_finisher' });
    } else if (draft.phase !== PHASE.CHASE_WINDOW) {
      draft.phase = PHASE.PRE_ATTACK;
    }
    return ult;
  });
}

// ---------------------------------------------------------------------------
// counter（反击）
// ---------------------------------------------------------------------------

/**
 * 对手在响应窗口打出反击牌。
 * @param {object} state
 * @param {number} side 反击方（必须是进攻方的对手）
 * @param {string} cardName
 */
function counter(state, side, cardName, opts = {}) {
  return transact(state, (draft) => {
    if (draft.phase !== PHASE.RESPONSE_WINDOW) throw new Error('当前不在响应窗口');
    const pending = draft.pendingCard;
    if (!pending) throw new Error('没有挂起的牌');
    if (side !== 1 - pending.attackerSide) throw new Error('只有对手能反击');
    const p = draft.players[side];
    if (hasStatus(p, CONTROL.SEALED)) throw new Error('被封锁，不能反击');
    if (pending.stiffBlocksCounter || hasStatus(p, CONTROL.STIFF)) throw new Error('僵直：本次攻击不能使用反击牌');
    // 草丛首击不可被普通反击：攻击者站草丛且本展开首击，防守方无法反击（仍可挣脱）
    if (pending.bushUncounterable) throw new Error('草丛首击不可被反击');
    const card = p.hand.find((c) => c.name === cardName);
    if (!card) throw new Error(`手牌中没有 "${cardName}"`);
    if (card.type !== 'counter') throw new Error(`${cardName} 不是反击牌`);

    // 结算反击（作为一次独立攻击，不进连击链）
    const savedChain = draft.chain;
    draft.chain = [];
    const log = resolveCard(draft, side, card, { ...opts, isFollow: false });
    draft.chain = savedChain;

    // 反击命中：终止原牌。拉封的核心动词是“反击夺权”，成功反击后强制结束对手展开。
    if (isSuccessfulCounterResolution(card, log.finalDamage)) {
      pending.log.counteredBy = card.name;
      pending.log.note += `被${card.name}反击;`;
      draft.pendingCard = null;
      if (draft.expansion) draft.expansion.pendingAttack = null;
      const generatedChase = getPosture(draft.players[pending.attackerSide]) !== POSTURE.NORMAL
        || draft.players[pending.attackerSide].statusSlots.instant.some(x=>[INSTANT.KNOCKED,INSTANT.WALL_HIT].includes(x.id));
      const mayTakeover = generatedChase || card.counterAttack || p.hero.id === 'lafeng';
      if (mayTakeover && (draft.expansion?.initiativeTransferCount || 0) < (draft.expansion?.maxInitiativeTransfers || 1)) {
        transferExpansionInitiative(draft, side, card.name);
        draft.phase = PHASE.CHASE_WINDOW;
        if (p.hero.id === 'lafeng' && p.mechanics.lafengSeize) { p.mechanics.lafengSeize = false; p.mechanics.lafengSeizeFollow = true; }
      } else {
        draft.phase = PHASE.PRE_ATTACK;
      }
    }
    draft.log.push({ type: 'counter', side, card: cardName });
    return log;
  });
}

// ---------------------------------------------------------------------------
// struggle（普通挣脱 / 惊险挣脱）
// ---------------------------------------------------------------------------

/**
 * 挣脱。普通挣脱在响应窗口；惊险挣脱在展开结束（可终止绝技后续）。
 * @param {object} state
 * @param {number} side
 * @param {object} [opts] { burst:boolean }
 */
function struggle(state, side, opts = {}) {
  return transact(state, (draft) => {
    if (draft.phase !== PHASE.RESPONSE_WINDOW) throw new Error('挣脱需在响应窗口');
    const pending=draft.pendingCard; if(!pending) throw new Error('没有挂起的牌');
    if(side!==1-pending.attackerSide) throw new Error('只有防守方能挣脱');
    if(pending.opts?.isUltimate) throw new Error('绝技不可挣脱');
    const p=draft.players[side];
    const risky=!!opts.burst || opts.mode==='risky';
    if(!risky){
      if((p.mechanics.struggleUsesThisSection||0)>=1) throw new Error('本节已使用普通挣脱');
      if(p.qi<2) throw new Error('普通挣脱需2气');
      p.qi-=2; p.mechanics.struggleUsesThisSection=(p.mechanics.struggleUsesThisSection||0)+1;
      pending.log.counteredBy='struggle'; pending.log.note+='被挣脱;';
      draft.pendingCard=null; if(draft.expansion){draft.expansion.pendingAttack=null;draft.expansion.endedReason='struggle';}
      expansionEndPipeline(draft,{voluntary:false,reason:'normal_escape'});
      draft.log.push({type:'struggle',side,costQi:2}); return {struggle:true};
    }
    if((p.mechanics.riskyStruggleUsesThisSection||0)>=1) throw new Error('本节已使用惊险挣脱');
    const payMode=opts.payMode || (p.qi>=1?'qi':'hp');
    if(payMode==='qi'){if(p.qi<1)throw new Error('惊险挣脱需1气');p.qi-=1;}
    else if(payMode==='hp'){if(p.hp<=2)throw new Error('惊险挣脱需支付2生命且不能因此倒下');p.hp-=2;emitV7Event(draft,{type:'HP_LOST',actorId:side,targetSide:side,payload:{amount:2,cause:'risky_escape_cost'}});}
    else throw new Error('惊险挣脱支付方式非法');
    p.mechanics.riskyStruggleUsesThisSection=(p.mechanics.riskyStruggleUsesThisSection||0)+1;
    p.mechanics.riskyStruggleUsedThisExpansion=true;
    const revealed=p.deck.length?p.deck.pop():null;
    if(revealed)p.discard.push(revealed);
    const success=!!revealed && (revealed.escapeSuccess===true || (revealed.cost??9)<=1);
    if(success){ pending.log.counteredBy='risky_struggle'; pending.log.note+='惊险挣脱成功;'; draft.pendingCard=null; if(draft.expansion)draft.expansion.pendingAttack=null; moveAway({state:draft,attacker:side,defender:1-side},1); expansionEndPipeline(draft,{voluntary:false,reason:'desperate_escape_success'}); }
    else { pending.log.note+='惊险挣脱失败，额外失去1生命;'; p.hp=Math.max(0,p.hp-1); draft.pendingCard=null; if(draft.expansion)draft.expansion.pendingAttack=null; continueResolution(draft,pending.attackerSide,pending.card,pending.log,{...(pending.opts||{}),consumeStiffOnResolve:pending.consumeStiffOnResolve}); }
    draft.log.push({type:'risky_struggle',side,success,revealed:revealed?.name||null}); return {risky:true,success};
  });
}

// ---------------------------------------------------------------------------
// passResponse（放弃响应，让挂起的牌继续结算）
// ---------------------------------------------------------------------------

/**
 * 防守方声明不响应（不反击不挣脱），让挂起的起手攻击牌继续走完剩余管线。
 * 不弃牌、不消耗资源，纯粹是"跳过响应窗口"。
 * @param {object} state
 * @param {number} side 防守方（必须是 pendingCard.attackerSide 的对手）
 * @returns {{ok:boolean, state:object, result?:object, error?:string}}
 */
function passResponse(state, side) {
  return transact(state, (draft) => {
    if (draft.phase !== PHASE.RESPONSE_WINDOW) throw new Error('当前不在响应窗口');
    const pending = draft.pendingCard;
    if (!pending) throw new Error('没有挂起的牌');
    if (side !== 1 - pending.attackerSide) throw new Error('只有防守方能声明放弃响应');
    draft.pendingCard = null;
    if (draft.expansion) draft.expansion.pendingAttack = null;
    // 从 pendingCard 恢复上下文（card/log/opts），继续走完剩余管线，不重复支付
    const log = continueResolution(draft, pending.attackerSide, pending.card, pending.log, { ...(pending.opts || {}), consumeStiffOnResolve: pending.consumeStiffOnResolve });
    draft.log.push({ type: 'pass_response', side });
    return log;
  });
}

// ---------------------------------------------------------------------------
// endExpansion（收势 / 结束展开）
// ---------------------------------------------------------------------------

/**
 * 主动收势，进入展开结束整备管线。
 * @param {object} state
 * @param {number} side
 */
function endExpansion(state, side) {
  return transact(state, (draft) => {
    if (ruleInitiativeSide(draft) !== side) throw new Error('无进攻权');
    if (![PHASE.PRE_ATTACK, PHASE.CHASE_WINDOW].includes(draft.phase)) {
      throw new Error('当前时点不能收势');
    }
    expansionEndPipeline(draft, { voluntary: true, reason: 'player_end' });
    return { phase: draft.phase };
  });
}

// resolveSupplyChoice 从 engine.js 导入，加命名导出供 ESM import * 使用

// 默认导出公开 API
const __default_engine_index_js = {
  newGame, getLegalActions, playCard, tacticalStep,
  useSkill, useRejuvenate, useUltimate, counter, struggle, passResponse, endExpansion,
  resolveSupplyChoice,
};


// ==================== sim/rng.js ====================
// ============================================================================
// V6 模拟器 — 可种子化 PRNG（mulberry32）与随机工具
// 零依赖，保证实验可复现。种子由 CLI 传入，逐局派生子种子。
// ============================================================================

/**
 * 创建 mulberry32 PRNG。
 * @param {number} seed 32 位无符号整数种子
 * @returns {() => number} 返回 [0, 1) 浮点的函数
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 从字符串派生 32 位种子（FNV-1a 变体），用于 "heroA:heroB:gameIndex" 这类键。
 * @param {string} str
 * @returns {number}
 */
function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * 组合主种子与键字符串，得到派生种子。
 * @param {number} baseSeed
 * @param {string} key
 * @returns {number}
 */
function deriveSeed(baseSeed, key) {
  return (baseSeed ^ hashSeed(key)) >>> 0;
}

/**
 * 从数组中随机取一个元素。
 * @template T
 * @param {() => number} rng
 * @param {T[]} arr
 * @returns {T}
 */
function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * 返回 [min, max] 闭区间整数。
 * @param {() => number} rng
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}


// ==================== sim/ai.js ====================
// ============================================================================
// V6 模拟器 — AI 决策人格
// 每种人格是一个函数 (state, legalActions, ctx) => action
//   state:        引擎返回的当前状态（只读使用）
//   legalActions: getLegalActions(state) 的结果
//   ctx:          { rng, heroId, playerId, opponentId, engine } 由模拟器注入
// 人格：
//   randomAI        纯随机（基线）
//   greedyAI        贪心：立即伤害 > 连击延续 > 低费高伤
//   tacticalAI      战术：6 维度评估（击倒/缩域/连击链/对手反击/资源点/保留）
//   roleAI(heroId)  角色倾向：按 verb 调整 tacticalAI 权重
// ============================================================================



// ---------------------------------------------------------------------------
// 公共工具
// ---------------------------------------------------------------------------

/**
 * 判断动作是否为攻击类（mock 的 attack/ranged/ultimate；真实引擎的 attack 型 play_card / use_ultimate）。
 * @param {Object} a
 * @returns {boolean}
 */
function isAttackAction(a) {
  if (a.kind === 'attack' || a.kind === 'ranged' || a.kind === 'ultimate' || a.kind === 'use_ultimate') return true;
  if (a.kind === 'play_card' && a.cardType === 'attack') return true;
  return false;
}

/**
 * 判断动作是否为移动类。
 * @param {Object} a
 * @returns {boolean}
 */
function isMoveAction(a) {
  return a.kind === 'move' || a.kind === 'tactical_step' || (a.kind === 'play_card' && a.cardType === 'move');
}

/**
 * 判断动作是否为回血类。
 * @param {Object} a
 * @returns {boolean}
 */
function isHealAction(a) {
  return a.kind === 'heal' || a.kind === 'rejuvenate'
    || (a.kind === 'play_card' && a.cardType === 'heal');
}

/**
 * 判断动作是否为资源/蓄气类。
 * @param {Object} a
 * @returns {boolean}
 */
function isResourceAction(a) {
  return a.kind === 'charge' || a.kind === 'resource' || a.kind === 'draw'
    || (a.kind === 'play_card' && a.cardType === 'resource');
}

/**
 * 从 legalActions 中按 kind 过滤。
 * @param {Array<Object>} actions
 * @param {...string} kinds
 * @returns {Array<Object>}
 */
function ofKind(actions, ...kinds) {
  return actions.filter((a) => kinds.includes(a.kind));
}

/**
 * 估计一个动作的"立即伤害"（含 mock 的 damage 字段与真实引擎的估算字段）。
 * @param {Object} action
 * @returns {number}
 */
function immediateDamage(action) {
  if (typeof action.damage === 'number') return action.damage;
  if (typeof action.estDamage === 'number') return action.estDamage;
  return 0;
}

/**
 * 动作费用（缺省 0）。
 * @param {Object} action
 * @returns {number}
 */
function costOf(action) {
  return action.cost ?? action.energyCost ?? 0;
}

/**
 * 每费伤害效率。
 * @param {Object} action
 * @returns {number}
 */
function efficiency(action) {
  const c = costOf(action);
  return immediateDamage(action) / Math.max(1, c);
}

/**
 * 读取玩家持续/控制状态 id 集合（真实引擎 statusSlots；mock 无则空集）。
 * @param {Object} state
 * @param {'A'|'B'} playerId
 * @returns {Set<string>}
 */
function readStatusIds(state, playerId) {
  const ids = new Set();
  const idx = playerId === 'A' ? 0 : 1;
  const p = state.players?.[idx] ?? state.players?.[playerId];
  const slots = p?.statusSlots;
  if (!slots) return ids;
  for (const s of slots.persistent ?? []) ids.add(s.id);
  for (const s of slots.control ?? []) ids.add(s.id);
  return ids;
}

/**
 * 读取玩家姿态（posture 槽）。
 * @param {Object} state
 * @param {'A'|'B'} playerId
 * @returns {string|null}
 */
function readPosture(state, playerId) {
  const idx = playerId === 'A' ? 0 : 1;
  const p = state.players?.[idx] ?? state.players?.[playerId];
  return p?.statusSlots?.posture?.id ?? null;
}

/**
 * 规范化读取玩家视图：兼容 mock（players.A/B 对象）与真实引擎（players[0/1] 数组 / playersAB 视图）。
 * @param {Object} state
 * @param {'A'|'B'} playerId
 * @returns {Object|null} {hp, maxHp, energy, qi, pos:{x,y}}
 */
function readPlayerView(state, playerId) {
  if (state.playersAB) return state.playersAB[playerId] ?? null;
  if (state.players?.[playerId]) return state.players[playerId];
  const idx = playerId === 'A' ? 0 : 1;
  const p = state.players?.[idx];
  if (!p) return null;
  return {
    hp: p.hp,
    maxHp: p.hero?.hp ?? p.maxHp ?? p.hp,
    energy: p.energy,
    qi: p.qi,
    pos: p.pos ? (p.pos.x !== undefined ? p.pos : { x: p.pos.c, y: p.pos.r }) : null,
    ultimateUsed: p.ultimateUsed ?? ((p.ultimatesUsed?.length ?? 0) > 0),
    // 手牌摘要（真实引擎 players[idx] 形态，mock 无 hand 字段时为 undefined）
    hand: Array.isArray(p.hand)
      ? p.hand.map((c) => ({
          name: c.name, cost: c.cost ?? 0, type: c.type, timing: c.timing,
          condition: c.condition ?? '', damage: c.damage ?? 0, range: c.range ?? 0,
        }))
      : undefined,
  };
}

/**
 * 当前玩家与对手的距离（若 state 提供 pos）。
 * @param {Object} state
 * @param {string} playerId
 * @returns {number|null}
 */
function distance(state,playerId){const me=readPlayerView(state,playerId),opp=readPlayerView(state,playerId==='A'?'B':'A');if(!me?.pos||!opp?.pos)return null;return dist({r:me.pos.y,c:me.pos.x},{r:opp.pos.y,c:opp.pos.x});}

// ---------------------------------------------------------------------------
// randomAI — 基线
// ---------------------------------------------------------------------------

/**
 * 纯随机 AI：均匀随机选一个合法操作。
 * @type {AIFunction}
 */
function randomAI(state, legalActions, ctx) {
  if (legalActions.length === 0) return null;
  return legalActions[Math.floor(ctx.rng() * legalActions.length)];
}

// ---------------------------------------------------------------------------
// greedyAI — 贪心
// ---------------------------------------------------------------------------

/**
 * 贪心 AI：
 *  1. 若能立即击倒（伤害 ≥ 对手当前 hp），优先选伤害最高的；
 *  2. 否则优先攻击类动作中"每费伤害"最高的；
 *  3. 无攻击可用时，优先向对手移动（拉近距离）；
 *  4. 能量富余且气未满时蓄气；hp 低于 40% 且有 heal 时回血；
 *  5. 都没有则 end。
 * @type {AIFunction}
 */
function greedyAI(state, legalActions, ctx) {
  if (legalActions.length === 0) return null;
  const me = readPlayerView(state, ctx.playerId);
  const opp = readPlayerView(state, ctx.opponentId);
  const oppHp = opp?.hp ?? Infinity;

  const attacks = legalActions.filter(isAttackAction);
  if (attacks.length > 0) {
    // 能斩杀则斩杀
    const lethal = attacks.filter((a) => immediateDamage(a) >= oppHp);
    if (lethal.length > 0) {
      return lethal.reduce((best, a) => (immediateDamage(a) > immediateDamage(best) ? a : best));
    }
    // 每费伤害最高
    return attacks.reduce((best, a) => (efficiency(a) > efficiency(best) ? a : best));
  }

  // 低血量优先回血
  if (me && me.hp <= me.maxHp * 0.4) {
    const heals = legalActions.filter(isHealAction);
    if (heals.length > 0) return heals[0];
  }

  // 向对手移动：六边格按动作返回的真实目标格评分。
  const moves=legalActions.filter(isMoveAction);
  if(moves.length>0&&me?.pos&&opp?.pos){
    const target={r:opp.pos.y,c:opp.pos.x};let best=null,bestD=Infinity;
    for(const m of moves){const dest=m.dest?{r:m.dest.r,c:m.dest.c}:null;if(!dest)continue;const d=dist(dest,target);if(d<bestD){best=m;bestD=d;}}
    if(best)return best;return moves[Math.floor(ctx.rng()*moves.length)];
  }

  // 蓄气/资源
  const resources = legalActions.filter(isResourceAction);
  if (resources.length > 0 && me && me.qi < CONST.QI_MAX) return resources[0];

  return ofKind(legalActions, 'end')[0] ?? legalActions[0];
}

// ---------------------------------------------------------------------------
// tacticalAI — 战术（6 维度评估）
// ---------------------------------------------------------------------------

/**
 * 战术 AI 默认权重（设计文档 AI 评估 6 维度）。
 * 维度：击倒 lethal / 缩域 shrink / 连击链 chain / 对手反击 counterRisk /
 *       资源点 resource / 保留 reserve。
 * @type {Object<string, number>}
 */
const TACTICAL_WEIGHTS = {
  lethal: 100,     // 直接击倒
  damage: 10,      // 每点立即伤害
  efficiency: 4,   // 每费伤害
  chain: 6,        // 连击链延续（CHASE_WINDOW 接追击）
  chainSetup: 8,   // 连击规划（PRE_ATTACK 留费接追击的起手牌加分）
  shrink: 5,       // 缩域临近时向安全区移动
  counterRisk: -4, // 对手有反击可用时，低伤攻击的惩罚
  resource: 3,     // 蓄气/过牌/回能
  reserve: 2,      // 保留：能量低时倾向低费动作
  heal: 8,         // 低血量回血
  ultimate: 30,    // 绝技可用且收益高（每局1次的爆发，鼓励使用）
};

/**
 * 战术 AI：对每个合法动作按 6 维度打分，选最高分。
 * @type {AIFunction}
 */
function tacticalAI(state, legalActions, ctx) {
  return tacticalWithWeights(state, legalActions, ctx, TACTICAL_WEIGHTS);
}

/**
 * 带权重的战术评估核心（roleAI 复用）。
 * @param {Object} state
 * @param {Array<Object>} legalActions
 * @param {Object} ctx
 * @param {Object<string,number>} W 权重表
 * @returns {Object|null}
 */

function v66ComboLookahead(state,action,ctx,depth=3){
  if(!action||action.kind!=='play_card'||action.cardType!=='attack')return 0;
  const side=ctx.playerId==='A'?0:1,p=state.players[side],def=state.players[1-side];
  const starter=p.hero.cards.find(c=>c.name===action.cardName||c.artKey===action.cardName);
  if(!starter)return 0;
  let energy=p.energy-(action.cost??starter.cost??0),steps=1,score=(starter.damage||0)*1.4;
  let flags=new Set(['hit']);
  if((starter.damage||0)>0)flags.add('hurt');
  if(starter.effect==='knock'||starter.effect==='knock2'){flags.add('knock');flags.add('wall')}
  if(starter.effect==='air')flags.add('air');
  if(starter.effect==='down')flags.add('down');
  if(['stiff','seal','air','down','knock','knock2'].includes(starter.effect))flags.add('status');
  if(starter.dash||starter.effect==='move'||starter.effect==='move2')flags.add('moved');
  const follows=p.hand.filter(c=>c.type==='attack'&&c.timing==='follow'&&c.name!==starter.name),usedCards=new Set();
  for(let depthIndex=1;depthIndex<depth;depthIndex++){
    let best=null,bestValue=-Infinity;
    for(const c of follows){
      if(usedCards.has(c))continue;
      const cond=c.condition||'hit';
      const conditionOK=flags.has(cond)
        ||(cond==='airdown'&&(flags.has('air')||flags.has('down')))
        ||(cond==='selfhurt'&&v7LedgerValue(state,side,'selfDamage')>0)
        ||(cond==='lowhp'&&def.hp<=def.hero.hp/2)
        ||(cond==='qi3'&&p.qi>=3)
        ||(cond==='fly'&&hasStatus(p,PERSISTENT.FLYING))
        ||(cond==='healed'&&v7LedgerValue(state,side,'healed')>0);
      if(!conditionOK&&!p.mechanics.swiftDouble&&!p.mechanics.lafengSeizeFollow)continue;
      let cost=Math.max(0,(c.cost||0)-1);
      if(p.hero.id==='baiye'&&p.mechanics.awakened)cost=Math.max(0,cost-1);
      if(cost>energy)continue;
      const range=effectiveRange(state,side,c);
      const bridge=(c.preMoveToward||c.preMoveIfLastRanged||c.preMoveIfHealed||p.mechanics.followStepAvailable||0);
      if(dist(p.pos,def.pos)>range+bridge&&!c.consumeFateLine)continue;
      const value=(c.damage||0)*2+(c.effect?2:0)-cost;
      if(value>bestValue){bestValue=value;best=c}
    }
    if(!best)break;
    usedCards.add(best);energy-=Math.max(0,(best.cost||0)-1);score+=bestValue+5;steps++;
    flags.add('hit');if((best.damage||0)>0)flags.add('hurt');
    if(best.effect==='knock'||best.effect==='knock2'){flags.add('knock');flags.add('wall')}
    if(best.effect==='air')flags.add('air');if(best.effect==='down')flags.add('down');
    if(['stiff','seal','air','down','knock','knock2'].includes(best.effect))flags.add('status');
    if(best.effect==='move'||best.effect==='move2')flags.add('moved');
  }
  if(steps>=3)score+=8;
  return score;
}



// V7.1 Combo Solver：基于公开手牌、资源、距离与展开状态的可复现束搜索。
// 不读取对手隐藏信息；输出路线而非只给起手分数。
function v71ComboSolver(state, side, options={}){
  const depth=Math.max(1,Math.min(6,options.depth||4));
  const beamWidth=Math.max(1,Math.min(24,options.beamWidth||8));
  const p=state.players[side],def=state.players[1-side];
  if(!p||!def)return {score:0,route:[],reason:'missing_player'};
  const sourceCards=Array.isArray(options.cards)?options.cards:p.hand;
  const cards=sourceCards.filter(c=>c&&c.type==='attack');
  const initialFlags=new Set(options.flags||[]);
  if(state.expansion?.attackCount>0)initialFlags.add('hit');
  if(v7LedgerValue(state,side,'effectiveDamage')>0)initialFlags.add('hurt');
  if(v7LedgerValue(state,side,'selfDamage')>0)initialFlags.add('selfhurt');
  if(v7LedgerValue(state,side,'moved'))initialFlags.add('moved');
  if(v7LedgerValue(state,side,'healed')>0)initialFlags.add('healed');
  const start={energy:p.energy,flags:initialFlags,route:[],score:0,used:new Set(),distance:dist(p.pos,def.pos),attackIndex:(state.expansion?.attackCount||0)};
  let beam=[start],best=start;
  const condOK=(condition,node,index)=>{
    if(!condition)return index===0;
    if(typeof condition==='string'){
      if(condition==='second')return node.attackIndex+1===2;
      if(condition==='lowhp')return def.hp<=def.hero.hp/2;
      if(condition==='range')return node.distance>1;
      if(condition==='dash')return true;
      if(condition==='qi3')return p.qi>=3;
      if(condition==='fly')return hasStatus(p,PERSISTENT.FLYING);
      if(condition==='airdown')return node.flags.has('air')||node.flags.has('down');
      return node.flags.has(condition);
    }
    if(Array.isArray(condition))return condition.every(c=>condOK(c,node,index));
    if(condition.all)return condition.all.every(c=>condOK(c,node,index));
    if(condition.any)return condition.any.some(c=>condOK(c,node,index));
    if(condition.not)return !condOK(condition.not,node,index);
    return false;
  };
  const extend=(node,c,index)=>{
    const isFirst=node.route.length===0;
    if(isFirst&&c.timing==='follow'&&!options.allowFollowAsStarter)return null;
    if(!isFirst&&c.timing!=='follow')return null;
    if(!condOK(c.condition,node,index)&&!(p.mechanics?.swiftDouble||p.mechanics?.lafengSeizeFollow))return null;
    let cost=Math.max(0,(c.cost||0)-(isFirst?0:1));
    if(!isFirst&&p.hero.id==='baiye'&&p.mechanics?.awakened)cost=Math.max(0,cost-1);
    if(cost>node.energy)return null;
    const bridge=(c.dash||0)+(c.preMoveToward||0)+(c.preMoveIfLastRanged||0)+(c.preMoveIfHealed||0)+(p.mechanics?.followStepAvailable||0);
    const range=effectiveRange(state,side,c);
    if(node.distance>range+bridge&&!c.consumeFateLine)return null;
    const flags=new Set(node.flags);flags.add('hit');if((c.damage||0)>0){flags.add('hurt');}
    if(c.effect==='knock'||c.effect==='knock2'){flags.add('knock');flags.add('wall');}
    if(c.effect==='air')flags.add('air');if(c.effect==='down')flags.add('down');
    if(['stiff','seal','air','down','knock','knock2'].includes(c.effect))flags.add('status');
    if(c.effect==='move'||c.effect==='move2'||c.dash)flags.add('moved');
    const tags=new Set(c.v71Tags||[]);
    let gain=(c.damage||0)*2-cost;
    if(c.effect)gain+=2;if(tags.has('finisher')||tags.has('chain_finisher'))gain+=5;
    if(tags.has('move_payoff')&&flags.has('moved'))gain+=3;
    if(tags.has('heal_payoff')&&flags.has('healed'))gain+=3;
    if(tags.has('forced_move')||tags.has('route_finisher'))gain+=2;
    const route=node.route.concat([{cardName:c.name,cost,damage:c.damage||0,effect:c.effect||'',condition:c.condition||''}]);
    return {energy:node.energy-cost,flags,route,score:node.score+gain+(route.length>=3?3:0),used:new Set([...node.used,c.name]),distance:Math.max(1,node.distance-(c.dash||c.preMoveToward||0)),attackIndex:node.attackIndex+1};
  };
  for(let i=0;i<depth;i++){
    const next=[];
    for(const node of beam){for(const c of cards){if(node.used.has(c.name))continue;const n=extend(node,c,i);if(n)next.push(n);}}
    if(!next.length)break;
    next.sort((a,b)=>b.score-a.score||b.route.length-a.route.length);
    beam=next.slice(0,beamWidth);if(beam[0].score>best.score)best=beam[0];
  }
  return {score:best.score,route:best.route,remainingEnergy:best.energy,flags:[...best.flags],searchedDepth:depth};
}


function v71RoleActionBonus(state,a,ctx){
  const profile=HEROES[ctx.heroId]?.v71Profile;if(!profile)return 0;
  const tags=new Set(a.v71Tags||a.tags||[]);let bonus=0;
  const map={chain_setup:'setup',move_synergy:'move',gap_close:'move',counter:'counter',counter_setup:'counter',heal:'heal',resource:'resource'};
  for(const [tag,key] of Object.entries(map))if(tags.has(tag))bonus+=(profile.ai?.[key]||0);
  if(a.kind==='play_card'){
    const card=HEROES[ctx.heroId]?.cards?.find(c=>c.name===a.cardName||c.artKey===a.cardName);
    for(const tag of card?.v71Tags||[])if(['finisher','chain_finisher','quality_finisher'].includes(tag))bonus+=4;
    if(profile.signature?.includes(a.cardName))bonus+=2;
  }
  if(a.kind==='counter')bonus+=(profile.ai?.counter||0);
  if(a.kind==='end'&&ctx.heroId==='lafeng')bonus+=2;
  return bonus;
}

function tacticalWithWeights(state, legalActions, ctx, W) {
  if (legalActions.length === 0) return null;
  const me = readPlayerView(state, ctx.playerId);
  const opp = readPlayerView(state, ctx.opponentId);
  const oppHp = opp?.hp ?? Infinity;
  const oppMaxHp = opp?.maxHp ?? 1;
  const myHp = me?.hp ?? 0;
  const myMaxHp = me?.maxHp ?? 1;
  const myEnergy = me?.energy ?? 0;
  const myQi = me?.qi ?? 0;
  const d = distance(state, ctx.playerId);
  const section = state.section ?? 1;
  const expansions = state.expansions ?? state.expansionCount ?? 0;
  // 相位感知：真实引擎 state.phase 是字符串；mock 无 phase 字段时按 legalActions 推断
  const phase = state.phase ?? inferPhase(legalActions);
  const inChaseWindow = phase === 'CHASE_WINDOW';
  const inPreAttack = phase === 'PRE_ATTACK';
  // 缩域压力：节数越高、距下次缩域越近，移动权重越大
  const shrinkPressure = Math.max(0, section - 1) + (expansions % CONST.EXPANSIONS_PER_SECTION) / CONST.EXPANSIONS_PER_SECTION;
  // 对手反击风险：对手能量≥1 且距离近时，我方低伤攻击易被反击
  const oppCounterThreat = opp && (opp.energy ?? 0) >= 1 && d !== null && d <= CONST.MELEE_RANGE ? 1 : 0;

  // ---- 绝技条件意识：气够但绝技有条件（needFly/needDownOrStiff 等）时，
  // 优先用能制造条件的牌（fly/down/stiff 效果），为绝技铺路 ----
  const hero = HEROES[ctx.heroId];
  const myUlt = hero?.ultimates?.[0];
  const ultReady = myUlt && myQi >= (myUlt.qi ?? 4) && !me?.ultimateUsed;
  const ultConditional = ultReady && (
    myUlt.needFly
    || myUlt.needDownOrStiff
    || myUlt.needDownStiffOrAir
    || myUlt.needStatus
    || myUlt.executeHp
    || myUlt.fateThreshold
  );
  // 我是否已满足绝技条件（粗略：flying 状态 / 对手倒地或僵直——从 state 状态槽读，读不到则假设未满足）
  const myStatuses = readStatusIds(state, ctx.playerId);
  const oppStatuses = readStatusIds(state, ctx.opponentId);
  const oppPosture = readPosture(state, ctx.opponentId);
  let ultConditionMet = !ultConditional;
  if (ultConditional) {
    if (myUlt.needFly && myStatuses.has('flying')) ultConditionMet = true;
    if (myUlt.needDownOrStiff && (oppPosture === 'downed' || oppStatuses.has('stiff'))) ultConditionMet = true;
    if (myUlt.needDownStiffOrAir
        && (oppPosture === 'downed' || oppPosture === 'airborne' || oppStatuses.has('stiff'))) {
      ultConditionMet = true;
    }
    if (myUlt.executeHp && oppHp <= myUlt.executeHp) ultConditionMet = true;
    if (myUlt.needStatus) {
      // 与引擎 ultimateValidationError 同口径：姿态异常 / 控制槽非空 /  burn|poison|frozen。
      // 不能把 shield/flying/marked 算进去，否则会把非法绝技误判成可用。
      const abnormalIds = ['stiff', 'sealed', 'rooted', 'burn', 'poison', 'frozen'];
      if (oppPosture !== 'normal' || [...oppStatuses].some((id) => abnormalIds.includes(id))) {
        ultConditionMet = true;
      }
    }
    // fateThreshold 无法从视图确认的条件，保守视为未满足
  }
  // 需要为绝技创造条件
  const setupForUlt = ultConditional && !ultConditionMet;

  // ---- 连击规划（PRE_ATTACK）：评估每张起手牌"打完后能否接追击" ----
  // 手牌里的追击牌（attack + timing follow），按费用升序
  const myHand = Array.isArray(me?.hand) ? me.hand : [];
  const followCards = myHand
    .filter((c) => c.type === 'attack' && c.timing === 'follow')
    .map((c) => c.cost ?? 0)
    .sort((x, y) => x - y);
  // 最便宜的追击牌费用（追击减费最多-1，按下限估算）
  const cheapestFollow = followCards.length > 0 ? Math.max(0, followCards[0] - 1) : null;
  /**
   * 起手牌 a 的连击潜力：打完后剩余能量是否够接最便宜追击牌，
   * 且起手牌本身能命中开追击（近身 range≤1 或带 dash 突进；远程起手命中后
   * 距离仍>1，接不了近身 follow，不算有连击潜力）。
   * @param {Object} a
   * @returns {boolean}
   */
  const canChainAfter = (a) => {
    if (cheapestFollow === null) return false;
    if (!isAttackAction(a) || a.cardType === 'counter') return false;
    // 远程起手（range>1 且无 dash）命中后接不了近身追击
    if ((a.range ?? 0) > CONST.MELEE_RANGE && !a.dash) return false;
    const remaining = myEnergy - costOf(a);
    return remaining >= cheapestFollow;
  };

  let best = null;
  let bestScore = -Infinity;

  for (const a of legalActions) {
    let score = v71RoleActionBonus(state,a,ctx);
    const dmg = immediateDamage(a);
    // CHASE_WINDOW 追击牌享受减费（最多-1），评分用下限估算避免低估效率/误判打不起
    const cost = inChaseWindow && a.kind === 'play_card' ? Math.max(0, costOf(a) - 1) : costOf(a);

    // 1. 击倒
    if(dmg>=oppHp&&dmg>0)score+=W.lethal;
    if(inPreAttack&&a.kind==='play_card'&&a.cardType==='attack'){const solved=v71ComboSolver(state,ctx.playerId==='A'?0:1,{depth:4});const starts=solved.route?.[0]?.cardName===a.cardName;score+=starts?solved.score:v66ComboLookahead(state,a,ctx,3)*0.6;}
    // 2. 基础伤害与效率
    score += dmg * W.damage + efficiency(a) * W.efficiency;
    // 3. 连击链延续（CHASE_WINDOW：追击牌强加分，end 收势惩罚）
    if (inChaseWindow) {
      if (isAttackAction(a)) {
        score += W.chain * 2;
        // 高伤追击额外奖励（连击链的价值在伤害）
        score += dmg * W.damage * 0.5;
      }
      if (a.kind === 'end') {
        // 有费有牌却收势 = 断链，重罚；没费没牌时 end 是唯一选择（中性）
        const hasPlayable = legalActions.some((x) => isAttackAction(x));
        score -= hasPlayable ? W.chain * 2 : 0;
      }
    }
    // 3b. 连击规划（PRE_ATTACK：起手牌留费接追击加分，花光能量扣分）
    if (inPreAttack && isAttackAction(a)) {
      if (canChainAfter(a)) {
        score += W.chainSetup;
      } else if (cheapestFollow !== null && cost > 0 && myEnergy - cost < cheapestFollow) {
        // 打这张牌会把能量花光导致接不了追击——除非能斩杀，否则扣分
        if (dmg < oppHp) score -= W.chainSetup * 0.5;
      }
      // 留费意识：低能量时，低费起手牌额外加分
      if (myEnergy <= 2 && cost <= 1 && cheapestFollow !== null) score += W.reserve;
    }
    // 4. 缩域：高节数时，向中心/对手移动的加分，原地不动的减分
    if (isMoveAction(a)) {
      // 方向归一：mock 用 dx/dy；真实引擎 tactical_step 用 dir（up=y-1 down=y+1 left=x-1 right=x+1）
      const mdx=a.dx??0,mdy=a.dy??0;
      const dest=a.dest?{r:a.dest.r,c:a.dest.c}:me?.pos?{r:me.pos.y+mdy,c:me.pos.x+mdx}:null;
      const nd0=dest&&opp?.pos?dist(dest,{r:opp.pos.y,c:opp.pos.x}):null;
      if (d !== null && d <= CONST.MELEE_RANGE) {
        // 已在交战距离：移动不产生射程收益，不发全局缩域分；
        // 远离扣分加倍——无意义乱走既浪费战术步又把对局拖向超时。
        if (nd0 !== null && nd0 > d) score -= W.shrink * 2;
      } else {
        score += W.shrink * shrinkPressure * 0.5;
      }
      // 向对手靠的移动额外加分（保持压制）
      if (nd0 !== null) {
        const nd = nd0;
        if (d !== null && nd < d) score += W.shrink * 0.5 + W.damage * 0.5;
        else if (d !== null && nd > d) score -= W.shrink; // 远离对手扣分
      }
      // 距离>1 且手牌有近身起手牌时，贴近是最高优先级（打不着人一切归零）
      if (d !== null && d > CONST.MELEE_RANGE) {
        const hasMeleeStarter = myHand.some((c) => c.type === 'attack' && c.timing === 'starter' && (c.range ?? 1) <= CONST.MELEE_RANGE);
        if (hasMeleeStarter) {
          const nd2=dest&&opp?.pos?dist(dest,{r:opp.pos.y,c:opp.pos.x}):d;
          if (nd2 < d) score += W.damage * (d - CONST.MELEE_RANGE); // 每近1格 +W.damage
        }
      }
    }
    // 5. 对手反击风险：低伤攻击在对手反击威胁下扣分
    if (oppCounterThreat && dmg > 0 && dmg <= 2) score += W.counterRisk;
    // 5b. 连击准备牌：按当前手牌中可兑现的后续资源评分，不无脑使用。
    if(inPreAttack&&a.kind==='play_card'&&a.cardType==='buff'){
      let setup=0;
      if(a.effect==='buff_luoji_roar'&&myHand.some(c=>c.type==='attack'))setup+=W.chainSetup;
      if(a.effect==='buff_chiyu_horn'&&myHand.some(c=>['knock','knock2'].includes(c.effect)))setup+=W.chainSetup+2;
      if(a.effect==='buff_lafeng_glory'&&myHand.some(c=>c.type==='counter'))setup+=W.chainSetup;
      if(a.effect==='buff_qiu_hormone'&&myHand.some(c=>c.condition==='selfhurt'||c.effect==='draw2_selfhurt'))setup+=W.chainSetup;
      if(a.effect==='buff_baiye_water'&&legalActions.some(isMoveAction))setup+=W.chainSetup;
      if(a.effect==='buff_baiye_wind'&&followCards.length)setup+=W.chainSetup;
      if(a.effect==='buff_lanyu_cry'&&myStatuses.has('flying')&&myHand.some(c=>c.condition==='fly'))setup+=W.chainSetup+2;
      if(a.effect==='buff_xuanyi_def'&&myHand.some(c=>c.type==='counter'))setup+=W.chainSetup;
      score+=setup;
    }
    // 6. 资源点：蓄气/过牌/回能
    if (a.kind === 'charge') {
      score += W.resource * (myQi < CONST.QI_MAX ? 1 : 0);
      // 气接近绝技阈值时权重提高
      if (myQi >= 3) score += W.resource;
    }
    if (isResourceAction(a)) score += W.resource;
    // 7. 保留：能量低时，高费动作扣分
    if (cost > myEnergy) score -= 1000; // 理论上不合法，防御
    if (myEnergy <= 2 && cost >= 2) score -= W.reserve * cost;
    // 8. 回血
    if (isHealAction(a)) {
      const missing = myMaxHp - myHp;
      const healAmount = a.heal ?? 0;
      if (missing <= 0) score -= W.heal * 2;
      else {
        score += W.heal * (missing / myMaxHp) * 2;
        score += Math.min(missing, healAmount) * W.heal * 0.25;
        if (myHp <= myMaxHp * 0.3) score += W.heal;
      }
    }
    // 9. 绝技：每局1次的爆发，积极使用
    if (a.kind === 'ultimate' || a.kind === 'use_ultimate') {
      score += W.ultimate + dmg * W.damage;
      // 斩杀：接近 lethal 高分
      if (dmg >= oppHp) score += W.lethal;
      // 中后期（≥3展开）或对手半血以下：积极放
      if (expansions >= 3 || oppHp <= oppMaxHp * 0.5) score += W.ultimate * 0.5;
      // 条件未满足的绝技（会被引擎拒绝）降权，避免浪费动作
      if (ultConditional && !ultConditionMet) score -= W.ultimate * 0.8;
    }
    // 9b. 为绝技创造条件：气够但条件未满足时，优先制造条件的牌/技能。
    if (setupForUlt && inPreAttack) {
      const eff = a.effect ?? '';
      const tags = new Set(a.tags ?? []);
      if (myUlt.needFly
          && (eff === 'fly'
            || eff === 'fly_draw'
            || eff === 'fly_draw_qi'
            || tags.has('enter_flying'))) {
        score += W.ultimate * 0.8; // 明确进飞行，为岚羽绝技与俯冲同时铺路
      }
      if ((myUlt.needDownOrStiff || myUlt.needDownStiffOrAir)
          && (eff === 'down'
            || eff === 'stiff'
            || eff === 'air'
            || tags.has('apply_airborne'))) {
        score += W.ultimate * 0.8;
      }
      if (myUlt.needStatus
          && (eff === 'down'
            || eff === 'stiff'
            || eff === 'air'
            || eff === 'seal'
            || tags.has('apply_airborne'))) {
        // 囚徒/白夜的“异常目标”绝技：先把对手打出姿态或控制异常，再兑现终结。
        score += W.ultimate * 0.8;
      }
    }
    // 9c. 技能战略语义：零伤技能不能按“伤害为0”直接判成无收益动作。
    if (a.kind === 'use_skill') {
      const tags = new Set(a.tags ?? []);
      if (tags.has('resource') || tags.has('energy_swing') || tags.has('discount')) score += W.resource * 2;
      if (tags.has('draw') || tags.has('growth')) score += W.resource * 1.5;
      if (tags.has('chain_setup') || tags.has('move_synergy')) score += W.chainSetup;
      if (tags.has('gap_close') && d !== null && d > CONST.MELEE_RANGE) score += W.shrink + W.chainSetup;
      if (tags.has('control') || tags.has('discard')) score += W.chain;
      if (tags.has('heal') && myHp < myMaxHp) score += W.heal * ((myMaxHp - myHp) / myMaxHp);
      if (tags.has('cleanse') && (myStatuses.size > 0 || readPosture(state, ctx.playerId) !== 'normal')) score += W.heal;
      if (tags.has('guard') || tags.has('counter_setup')) score += oppCounterThreat ? W.reserve + W.chain : W.reserve;
      if (tags.has('attack_bonus') || tags.has('next_attack_bonus')) {
        const hasStarter = legalActions.some((x) => isAttackAction(x) && x.kind !== 'use_ultimate');
        if (hasStarter) score += W.chainSetup + W.damage * 0.5;
      }
      // 岚羽尚未飞行时，进飞行是“俯冲首击+3”的开关；已有飞行时避免重复开同类技能。
      if (tags.has('enter_flying')) {
        score += myStatuses.has('flying') ? -W.chainSetup : W.chainSetup + W.damage;
      }
    }
    // 9f. setup 能耗审计：零伤 setup（技能/buff 牌）若用后剩余能量打不起任何攻击，
    // 本展开大概率白挂（buff 过期），把 setup 加分收回来。
    // 豁免：为绝技铺条件（setupForUlt）时，花光能量创造条件是正当投资。
    if (inPreAttack && dmg === 0 && !setupForUlt
        && (a.kind === 'use_skill' || (a.kind === 'play_card' && a.cardType === 'buff'))) {
      const remaining = myEnergy - cost;
      const attackCosts = legalActions.filter(isAttackAction).map(costOf);
      const cheapestAttack = attackCosts.length ? Math.min(...attackCosts) : null;
      // 形态b：legal 里根本没有攻击动作——本展开完全打不了，buff 必过期，同样白挂。
      if (cheapestAttack === null || remaining < cheapestAttack) {
        score -= W.chainSetup + W.damage * 0.5;
      }
    }
    // 9d. 岚羽已飞行时兑现首击：可命中的起手攻击优先于继续屯资源或重复铺状态。
    if (ctx.heroId === 'lanyu' && inPreAttack && myStatuses.has('flying') && isAttackAction(a)) {
      score += W.damage * 3; // 对应已程序化的俯冲 +3，不是额外规则伤害
    }
    // 9e. 追击终结：引擎已筛出合法的冰面终曲/乱步封喉，应压过普通追击。
    if (inChaseWindow && a.kind === 'use_ultimate'
        && ((ctx.heroId === 'youying' && a.ultId === 'chaos_throat')
          || (ctx.heroId === 'baiye' && a.ultId === 'ice_finale'))) {
      score += W.ultimate + W.chain * 2;
    }
    // 反击动作：响应窗口才有意义（此时 phase=RESPONSE_WINDOW，对手刚攻击）
    if (a.kind === 'counter') {
      score += phase === 'RESPONSE_WINDOW' ? W.resource + dmg * W.damage * 0.5 : -5;
    }
    // pass（放弃响应）：手牌紧张时优于 struggle（不弃牌）
    if (a.kind === 'pass') {
      score += 1;
    }
    // struggle（挣脱弃1牌）：对手连击威胁大时才值得
    if (a.kind === 'struggle') {
      score += dmg >= 3 ? 2 : -1;
    }
    // end：低分兜底，能量耗尽时中性
    if (a.kind === 'end') {
      score += myEnergy <= 0 ? 1 : -1;
      // 攒费意识：当前没有可打攻击牌、但手牌里有差1-2费就能解锁的攻击牌时，
      // 收势蓄能是投资（下展开能量+1），不是放弃。不修这个，AI 会把每1费都零钱花光，
      // 永远够不到牌库里一半的2费牌（R4 囚徒憋尿的根因之一）。
      if (inPreAttack && myEnergy < (CONST.ENERGY_MAX ?? 5)) {
        const hasPlayableAttack = legalActions.some(isAttackAction);
        if (!hasPlayableAttack) {
          const unlockGap = myHand
            .filter((c) => c.type === 'attack' && (c.cost ?? 0) > myEnergy)
            .map((c) => c.cost - myEnergy);
          if (unlockGap.length > 0 && Math.min(...unlockGap) <= 2) {
            score += W.reserve * 2;
          }
        }
      }
    }
    // 补给四选一：按当前最紧缺资源选
    if (a.kind === 'supply_choice') {
      const hpRatio = myHp / myMaxHp;
      switch (a.option) {
        case 'heal': score += hpRatio < 0.4 ? W.heal * 2 : (hpRatio < 0.7 ? W.heal : W.heal * 0.3); break;
        case 'draw': score += myHand.length < 3 ? W.resource * 2 : W.resource * 0.5; break;
        case 'energy': score += myEnergy <= 0 ? W.resource * 2 : W.resource * 0.5; break;
        case 'shield': score += W.reserve + (hpRatio > 0.7 ? W.heal * 0.5 : 0); break;
      }
    }
    // 过牌边际效用：手牌已经很多时，0费过牌是白烧动作数��推向400动作超时）
    if (isResourceAction(a) && myHand.length >= 8) {
      score -= W.resource;
    }

    // 微小随机扰动打破平局（用 ctx.rng 保证可复现）
    score += ctx.rng() * 0.01;

    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}

/**
 * mock 引擎无 state.phase 时的相位推断（容错）。
 * @param {Array<Object>} legalActions
 * @returns {string}
 */
function inferPhase(legalActions) {
  if (legalActions.some((a) => a.kind === 'counter' || a.kind === 'pass' || a.kind === 'struggle')) {
    return 'RESPONSE_WINDOW';
  }
  return 'PRE_ATTACK';
}

// ---------------------------------------------------------------------------
// roleAI — 角色倾向
// ---------------------------------------------------------------------------

/**
 * 按角色 verb（核心动词）生成权重修正。
 * 未知名角色回退到 tacticalAI 默认权重。
 * @param {string} heroId
 * @returns {Object<string, number>}
 */
function roleWeights(heroId) {
  const hero = HEROES[heroId];
  const W = { ...TACTICAL_WEIGHTS };
  if (!hero) return W;
  switch (hero.verb) {
    case '逆境换血': // 洛基：敢换血，连击链与低血量收益更高
      W.chain += 4;
      W.chainSetup += 3;
      W.heal -= 3;
      W.counterRisk += 2; // 更怕反击（被拉封克）
      W.lethal += 10;
      break;
    case '撞墙压制': // 赤羽：优先击退撞墙、贴身压制
      W.damage += 2;
      W.chain += 2;
      W.chainSetup += 2;
      W.shrink += 2;
      W.heal -= 2;
      break;
    case '反击精确': // 拉封：少而强，保留资源打高质量一击，反击权重高
      W.efficiency += 4;
      W.reserve += 3;
      W.chain -= 3;
      W.counterRisk -= 2;
      break;
    case '自残爆发': // 囚徒013：高爆发，低血量仍激进
      W.damage += 4;
      W.lethal += 15;
      W.heal -= 5;
      W.reserve -= 2;
      break;
    case '成长觉醒': // 白夜：前期保守拖后期，资源权重大
      W.resource += 5;
      W.reserve += 4;
      W.lethal -= 10;
      W.heal += 3;
      break;
    case '飞行机动': // 岚羽：移动权重最高，远程消耗
      W.shrink += 4;
      W.chain += 1;
      W.counterRisk -= 1;
      break;
    case '位移节奏': // 游影：贴身缠斗，移动+连击
      W.shrink += 3;
      W.chain += 3;
      W.chainSetup += 2;
      W.efficiency += 2;
      break;
    case '回血反打': // 玄医：回血权重最高，反打
      W.heal += 8;
      W.reserve += 2;
      W.lethal -= 5;
      break;
    case '命运压制': // 法尤姆：过牌资源拉满，速叠
      W.resource += 6;
      W.chain += 2;
      W.reserve += 1;
      break;
    default:
      break;
  }
  return W;
}

/**
 * 角色倾向 AI 工厂：返回该角色专属的决策函数。
 * @param {string} heroId
 * @returns {AIFunction}
 */
function roleAI(heroId) {
  const W = roleWeights(heroId);
  return (state, legalActions, ctx) => tacticalWithWeights(state, legalActions, ctx, W);
}

/**
 * AI 注册表：CLI 按名字解析。
 * @type {Object<string, AIFunction|((heroId:string)=>AIFunction)>}
 */
const AI_REGISTRY = {
  random: randomAI,
  greedy: greedyAI,
  tactical: tacticalAI,
  role: roleAI, // 工厂，模拟器按当前 heroId 调用
};

/**
 * 按名字与角色解析出具体决策函数。
 * @param {string} name 'random'|'greedy'|'tactical'|'role'
 * @param {string} heroId
 * @returns {AIFunction}
 */
function resolveAI(name, heroId) {
  if (name === 'role') return roleAI(heroId);
  const fn = AI_REGISTRY[name];
  if (!fn) throw new Error(`未知 AI: ${name}`);
  return fn;
}

/**
 * @typedef {(state:Object, legalActions:Array<Object>, ctx:{rng:()=>number, heroId:string, playerId:string, opponentId:string}) => Object|null} AIFunction
 */


// ==================== sim/realEngineAdapter.js ====================
// ============================================================================
// V6 模拟器 — 真实引擎适配器
// engine-dev 的真实引擎（v6/src/engine/index.js）暴露的是细粒度相位驱动 API：
//   simNewGame(heroA, heroB, {first:0|1, seed}) / simGetLegalActions(state) ->
//     {phase, actions[], cards[], canEnd, ultimates[], tacticalStepAvailable,
//      canStruggle, canBurstStruggle}
//   playCard/tacticalStep/useSkill/useUltimate/counter/struggle/endExpansion
//   均返回 {ok, state, result?, error?}；side 为 0|1；winner 为 0|1|null。
// 本适配器将其包装成模拟器约定的统一接口：
//   simNewGame(heroAId, heroBId, {firstPlayer:'A'|'B', seed})
//   simGetLegalActions(state) -> 扁平动作数组 [{kind, ...}]
//   applyAction(state, action) -> 新 state（带 A/B 视角字段与统计）
// 动作 kind 一览：
//   play_card {cardIndex}     打出 cards[cardIndex]（起手/非攻击/追击，按相位自动判定 isFollow）
//   tactical_step {dir}       免费战术步
//   use_skill {skillId}       耗能技能（PRE_ATTACK）
//   use_ultimate {ultId}      绝技
//   counter {cardIndex}       响应窗口反击（cards 为反击牌列表）
//   struggle                  普通挣脱（响应窗口）
//   burst_struggle            惊险挣脱（展开结束）
//   end                       收势/结束当前时点
// ============================================================================

const realEngine = __default_engine_index_js;

/**
 * 技能战略标签只描述 AI 可用的公开语义，不参与规则结算。
 * 规则真源仍在 engine/index.js；这里负责把“零伤技能”翻译成可比较的决策价值。
 */
const SKILL_AI_TAGS = Object.freeze({
  champ_round: ['attack_bonus', 'chain_setup'],
  hell_train: ['heal', 'draw'],
  corner_storm: ['wall_setup', 'attack_bonus'],
  sun_dance: ['knock_setup', 'control'],
  ancestral_hunt: ['control', 'attack_bonus'],
  blood_totem: ['self_damage', 'attack_bonus'],
  duel_oath: ['single_hit_bonus', 'attack_bonus'],
  glory_call: ['counter_setup'],
  curtain_call: ['heal', 'resource', 'single_hit_bonus'],
  full_overload: ['attack_bonus', 'chain_setup', 'self_damage'],
  bio_molt: ['cleanse', 'heal'],
  hormone_tide: ['attack_bonus', 'self_damage'],
  chick_guard: ['guard', 'growth'],
  cocoon_form: ['growth', 'draw'],
  lake_dance: ['move_synergy', 'attack_bonus'],
  sky_hunt: ['enter_flying', 'ultimate_setup', 'attack_bonus'],
  gale_net: ['apply_airborne', 'ultimate_setup', 'control'],
  sky_cry: ['enter_flying', 'ultimate_setup', 'next_attack_bonus'],
  flow_break: ['move_synergy', 'chain_setup'],
  swift_double: ['gap_close', 'chain_setup'],
  light_breath: ['energy_swing', 'resource', 'gap_close'],
  herb_revive: ['cleanse', 'heal'],
  great_cycle: ['heal', 'resource'],
  defense_offense: ['counter_setup'],
  fate_leap: ['draw', 'growth'],
  tomb_strip: ['discard', 'control'],
  star_calc: ['discount', 'resource'],
});

/**
 * 包装 simNewGame。
 * @param {string} heroAId
 * @param {string} heroBId
 * @param {{firstPlayer?: 'A'|'B', seed?: number}} [options]
 * @returns {Object} 适配后的 state（内部持有真实 state 引用）
 */
function simNewGame(heroAId, heroBId, options = {}) {
  const first = options.firstPlayer === 'B' ? 1 : 0;
  // map 透传：选项携带 map 时注入含地形棋盘（地形规则在引擎层）；不传则默认无地形，零影响。
  const inner = realEngine.newGame(heroAId, heroBId, { first, seed: options.seed, map: options.map });
  return wrapState(inner, heroAId, heroBId);
}

/**
 * 把真实 state 包装为模拟器视角（A=players[0], B=players[1]）。
 * 直接在真实 state 上附加适配字段（不改引擎内部逻辑，只加外层视图）。
 * @param {Object} inner 真实 GameState
 * @param {string} heroAId
 * @param {string} heroBId
 * @returns {Object}
 */
function wrapState(inner, heroAId, heroBId) {
  const s = inner;
  s.heroA = heroAId;
  s.heroB = heroBId;
  // A/B 视角：RESPONSE_WINDOW 时操作方是防守方（pendingCard.attackerSide 的对手），
  // 其余相位操作方由 ruleActorSide() 裁定
  Object.defineProperty(s, 'currentPlayer', {
    get() {
      let side = ruleActorSide(this);
      if (this.phase === 'RESPONSE_WINDOW' && this.pendingCard) {
        side = 1 - this.pendingCard.attackerSide;
      }
      return side === 0 ? 'A' : 'B';
    },
    configurable: true,
  });
  Object.defineProperty(s, 'winnerAB', {
    get() {
      if (this.winner == null) return null;
      return this.winner==='draw'?'DRAW':(this.winner===0?'A':'B');
    },
    configurable: true,
  });
  // 模拟器统计（从 log 派生，惰性累计在 _statsAcc）
  if (!s._statsAcc) {
    s._statsAcc = {
      attacks: { A: 0, B: 0 },
      counters: { A: 0, B: 0 },
      chainCards: { A: 0, B: 0 },
      damageDealt: { A: 0, B: 0 },
      qiGenerated: { A: 0, B: 0 },
      qiUsed: { A: 0, B: 0 },
      ultimatesUsed: { A: 0, B: 0 },
      heals: { A: 0, B: 0 },
      wallHits: { A: 0, B: 0 },
      _logCursor: 0,
    };
  }
  return s;
}

/**
 * 从真实 state 的 log 增量更新统计（模拟器 buildResult 读取 stats 字段）。
 * 真实引擎日志类型：resolve（ResolutionLog: cardName/finalDamage/statusApplied/note）、
 *   counter、ultimate、skill、tactical_step、struggle、burst_struggle、hand_redraw、scry。
 * @param {Object} s 包装后的 state
 */
function updateStats(s) {
  const acc = s._statsAcc;
  const log = s.log || [];
  for (let i = acc._logCursor; i < log.length; i++) {
    const e = log[i];
    const side = e.side === 0 ? 'A' : e.side === 1 ? 'B' : null;
    switch (e.type) {
      case 'resolve': {
        // 一次卡牌结算；ResolutionLog 在 e.log
        const rl = e.log ?? {};
        if (side) {
          // 攻击判定：有基础伤害或最终伤害（反击牌也由 counter 日志单独计）
          if (rl.cardType === 'attack' || rl.cardType === 'counter') {
            acc.attacks[side]++;
            acc.damageDealt[side] += rl.finalDamage ?? 0;
          }
          if ((rl.healing ?? 0) > 0) acc.heals[side] += rl.healing;
          // 撞墙：note 含 wall_hit 或 statusApplied 含 wall_hit
          const note = rl.note ?? '';
          const applied = Array.isArray(rl.statusApplied) ? rl.statusApplied.join(',') : '';
          if (note.includes('wall_hit') || applied.includes('wall_hit')) acc.wallHits[side]++;
        }
        break;
      }
      case 'counter': {
        if (side) acc.counters[side]++;
        break;
      }
      case 'ultimate': {
        if (side) {
          acc.ultimatesUsed[side]++;
          if (typeof e.damage === 'number') acc.damageDealt[side] += e.damage;
        }
        break;
      }
      default:
        break;
    }
  }
  acc._logCursor = log.length;
  // 连击链最长：chain 在展开期间累积，实时取最大值
  const chainLen = Array.isArray(s.chain) ? s.chain.length : 0;
  const cur = ruleActorSide(s) === 0 ? 'A' : 'B';
  if (chainLen > acc.chainCards[cur]) acc.chainCards[cur] = chainLen;
  // 气产/气用：从双方 qi 变化难以精确归因，用差分估算——
  // qi 增加记 qiGenerated，减少记 qiUsed（绝技扣气在 ultimate 已计伤害，这里只统计量）
  for (const [side, idx] of [['A', 0], ['B', 1]]) {
    const qi = s.players[idx]?.qi ?? 0;
    const prev = acc._lastQi?.[side] ?? 0;
    if (qi > prev) acc.qiGenerated[side] += qi - prev;
    else if (qi < prev) acc.qiUsed[side] += prev - qi;
    if (!acc._lastQi) acc._lastQi = { A: 0, B: 0 };
    acc._lastQi[side] = qi;
  }
  // stats 视图
  s.stats = {
    attacks: acc.attacks,
    counters: acc.counters,
    chainCards: acc.chainCards,
    damageDealt: acc.damageDealt,
    qiGenerated: acc.qiGenerated,
    qiUsed: acc.qiUsed,
    ultimatesUsed: acc.ultimatesUsed,
    heals: acc.heals,
    wallHits: acc.wallHits,
  };
  // 模拟器读取的 expansions / players.A/B 视图
  s.expansions = s.expansionCount;
  s.playersAB = {
    A: viewPlayer(s.players[0]),
    B: viewPlayer(s.players[1]),
  };
}

/**
 * 玩家视图（模拟器 AI 读取 hp/energy/qi/pos/maxHp/hand）。
 * hand 暴露手牌摘要（只读），供 AI 做连击规划（评估起手后能否接追击）。
 * @param {Object} p 真实 PlayerState
 * @returns {Object}
 */
function viewPlayer(p) {
  return {
    hp: p.hp,
    maxHp: p.hero?.hp ?? p.hp,
    energy: p.energy,
    qi: p.qi,
    pos: p.pos ? { x: p.pos.c, y: p.pos.r } : null,
    ultimateUsed: (p.ultimatesUsed?.length ?? 0) > 0,
    handCount: p.hand?.length ?? 0,
    // 手牌摘要（只读）：AI 连击规划用，勿改
    hand: (p.hand ?? []).map((c) => ({
      name: c.name,
      cost: c.cost ?? 0,
      type: c.type,
      timing: c.timing,
      condition: c.condition ?? '',
      damage: c.damage ?? 0,
      range: c.range ?? 0,
    })),
  };
}

/**
 * 把真实 simGetLegalActions 的结构化结果展平为统一动作数组。
 * 注意：真实引擎列牌时不做距离校验（playCard 才报错），适配器做一层距离预过滤，
 * 避免 AI 反复选中不可用牌导致事务空转。
 * @param {Object} state 包装后的 state
 * @returns {Array<Object>}
 */

function stableActionPayload(action) {
  const copy = {};
  for (const key of Object.keys(action).sort()) {
    if (['actionId','skill'].includes(key)) continue;
    const value = action[key];
    if (typeof value === 'function' || value === undefined) continue;
    copy[key] = value;
  }
  return copy;
}
function makeActionId(state, action) {
  const phase = state.phase || 'UNKNOWN';
  const expansionId = state.expansion?.id || `exp-${state.expansionCount || 0}`;
  const actor = phase === PHASE.RESPONSE_WINDOW && state.pendingCard
    ? 1 - state.pendingCard.attackerSide
    : ruleActorSide(state);
  const raw = JSON.stringify(stableActionPayload(action));
  let h = 2166136261 >>> 0;
  for (let i=0;i<raw.length;i++){ h ^= raw.charCodeAt(i); h = Math.imul(h,16777619) >>> 0; }
  return `${expansionId}:${phase}:${actor}:${action.kind}:${h.toString(16)}`;
}
function decorateLegalActions(state, actions) {
  return actions.map(a => ({...a, actionId: makeActionId(state,a)}));
}

function simGetLegalActions(state) {
  if (state.winner != null) return [];
  // 事务型牌序选择优先于普通行动。旧 harness 不再跳过 scry，
  // 而是显式提交一个可复现的“保持当前牌序”动作。
  if (state.pendingChoice) {
    const choice = getPendingChoiceOptions(state);
    if (choice?.type === 'DECK_ORDER') {
      return decorateLegalActions(state, [{
        kind: 'scry_order',
        choiceId: choice.id,
        cardInstanceIds: choice.cards.slice().reverse().map(c => c.instanceId || c.id || c.name),
        cardNames: choice.cards.slice().reverse().map(c => c.name),
        cost: 0
      }]);
    }
  }
  const la = realEngine.getLegalActions(state);
  const out = [];
  const phase = la.phase;
  // 响应窗口的操作方是防守者；其他时点统一走 ruleActorSide()。
  // 距离、费用与动作摘要必须跟随真实操作方，否则会用错角色的钱包筛牌。
  const actingSide = phase === 'RESPONSE_WINDOW' && state.pendingCard
    ? 1 - state.pendingCard.attackerSide
    : ruleActorSide(state);
  const me = state.players[actingSide];
  const opp = state.players[1 - actingSide];
  const d = me?.pos && opp?.pos
    ? dist(me.pos,opp.pos)
    : null;
  // 本回合已失败的动作签名（事务空转防护）
  const failed = state._failedActions ?? new Set();

  // 可打出的牌（PRE_ATTACK 起手/非攻击；CHASE_WINDOW 追击；RESPONSE_WINDOW 反击）
  if (Array.isArray(la.cards)) {
    la.cards.forEach((card, idx) => {
      // 距离预过滤：攻击/反击牌 range>0 且距离超出则跳过（move/buff 等 range 0 不过滤）
      if (d !== null && (card.type === 'attack' || card.type === 'counter') && (card.range ?? 0) > 0 && d > card.range) {
        return;
      }
      // 费用预过滤（CHASE_WINDOW 追击牌）：打不起的牌不列给 AI。
      // 适配器拿不到引擎 computeCost（含追击减费），保守用 card.cost-1 下限估算——
      // 追击减费最多-1，故实际费用 >= card.cost-1；若 energy < card.cost-1 必然打不起。
      if (phase === 'CHASE_WINDOW' && me) {
        const minCost = Math.max(0, (card.cost ?? 0) - 1);
        if (me.energy < minCost) return;
      }
      const sig = `${phase}:${card.name}`;
      if (failed.has(sig)) return;
      if (phase === 'RESPONSE_WINDOW') {
        out.push({ kind: 'counter', cardInstanceId: card.instanceId || card.id || card.name, cardKey: card.instanceId || card.id || card.name, cardName: card.name, damage: card.damage ?? 0, cost: card.cost ?? 0 });
      } else {
        const baseAction={kind:'play_card',cardInstanceId:card.instanceId||card.id||card.name,cardKey:card.instanceId||card.id||card.name,cardName:card.name,cardType:card.type,timing:card.timing,damage:card.type==='heal'?0:(card.damage??0),heal:card.type==='heal'?(card.damage??0):0,cost:computeCost(state,actingSide,card,phase==='CHASE_WINDOW'),effect:card.effect??'',condition:card.condition??'',range:effectiveRange(state,actingSide,card)};
        const moveBudget=card.moveBudget||(card.effect==='move2'?2:card.effect==='move'?1:0);
        if(moveBudget>0){
          const budget=moveBudget+(me.mechanics.baiyeWaterMoveArmed?1:0),paths=getReachableMovePaths(state,actingSide,budget,{approachOnly:!!card.approachOnly});
          for(const item of paths)out.push({...baseAction,movePath:item.path,dest:item.dest,moveSpent:item.spent});
        }else out.push(baseAction);
        if(me.hero.id==='youying'&&card.type==='attack'&&me.mechanics.wanderMovesUsed<2){
          const wb=me.mechanics.flowBreak?2:1;
          const originals=out.filter(a=>a.kind==='play_card'&&(a.cardInstanceId||a.cardKey)===(card.instanceId||card.id||card.name)&&!a.wanderPath);
          for(const original of originals){
            const start=original.dest||me.pos;
            const paths=getReachableMovePaths(state,actingSide,wb,{start});
            for(const item of paths)out.push({...original,wanderPath:item.path,wanderDest:item.dest});
          }
        }
      }
    });
  }
  // 战术步：列出移动力范围内全部合法路径。
  for(const item of la.tacticalStepPaths??[]){const sig=`step:${item.dest.r},${item.dest.c}`;if(!failed.has(sig))out.push({kind:'tactical_step',dir:'path',dest:item.dest,movePath:item.path,moveSpent:item.spent,cost:0})}
  // 技能：完整合法性由真实引擎筛选；tags 仅供 AI 理解战略用途。
  for (const skill of la.skills ?? []) {
    if (!failed.has(`skill:${skill.id}`)) {
      const base={kind:'use_skill',skillId:skill.id,cost:skill.cost,name:skill.name,tags:SKILL_AI_TAGS[skill.id]??[],skill};
      if(skill.moveBudget){for(const item of getReachableMovePaths(state,actingSide,skill.moveBudget))out.push({...base,movePath:item.path,dest:item.dest,moveSpent:item.spent})}
      else out.push(base);
    }
  }
  if (la.canRejuvenate && !failed.has('rejuvenate')) {
    out.push({ kind: 'rejuvenate', cost: 0, qi: 2, heal: 2, name: '回春' });
  }
  // 绝技（距离预过滤：ten_sec_kill 类需相邻的，引擎在 useUltimate 才校验——这里按 ult.range 或保守放行，
  // 失败的会被 _failedActions 记录，下回合不再选）
  if (Array.isArray(la.ultimates)) {
    for (const u of la.ultimates) {
      if (!failed.has(`ult:${u.id}`)) {
        out.push({ kind: 'use_ultimate', ultId: u.id, damage: u.damage ?? 0, qi: u.qi ?? 0, name: u.name });
      }
    }
  }
  // 挣脱
  if (la.canStruggle) out.push({ kind: 'struggle', cost: 0 });
  if (la.canBurstStruggle) out.push({ kind: 'burst_struggle', cost: 0 });
  // 放弃响应（RESPONSE_WINDOW 专用，不弃牌）
  if (phase === 'RESPONSE_WINDOW') out.push({ kind: 'pass', cost: 0 });
  // 补给四选一：SUPPLY_CHOICE 相位返回 4 个选项
  if (phase === 'SUPPLY_CHOICE') {
    return decorateLegalActions(state, [
      { kind: 'supply_choice', option: 'heal', label: '回血 3', icon: '❤' },
      { kind: 'supply_choice', option: 'energy', label: '+1 能量', icon: '⚡' },
      { kind: 'supply_choice', option: 'draw', label: '摸 1 牌', icon: '🂠' },
      { kind: 'supply_choice', option: 'shield', label: '1 层护盾', icon: '🛡' },
    ]);
  }
  // 收势/结束
  if (la.canEnd) out.push({ kind: 'end', cost: 0 });
  return decorateLegalActions(state, out);
}

/**
 * 应用统一动作：分发到真实引擎的细粒度 API。
 * @param {Object} state 包装后的 state
 * @param {Object} action
 * @returns {Object} 新 state（真实引擎 transact 返回新对象，重新包装）
 */
function applyAction(state, action) {
  // 稳定动作协议：带 actionId 的命令必须仍存在于当前 legal actions；状态变化后旧 actionId 自动失效。
  if (action?.actionId) {
    const canonical = simGetLegalActions(state).find(a => a.actionId === action.actionId);
    if (!canonical) return state;
    action = canonical;
  }
  // 操作方由核心状态机裁定：PendingChoice / 响应方 / 展开主动方。
  let side = ruleActorSide(state);
  let res = null;
  switch (action.kind) {
    case 'play_card': {
      const la = realEngine.getLegalActions(state);
      const card = la.cards?.find((c) => (c.instanceId || c.id || c.name) === (action.cardInstanceId || action.cardKey)) || la.cards?.find((c) => c.name === action.cardName);
      if (!card) return state; // 非法，防御
      const isFollow = state.phase === 'CHASE_WINDOW';
      res=realEngine.playCard(state,side,card.name,{isFollow,movePath:action.movePath||null,wanderPath:action.wanderPath||null});
      break;
    }
    case 'tactical_step':
      res=realEngine.tacticalStep(state,side,action.dir,{movePath:action.movePath||null});
      break;
    case 'use_skill':
      res=realEngine.useSkill(state,side,action.skillId,{movePath:action.movePath||null});
      break;
    case 'rejuvenate':
      res = realEngine.useRejuvenate(state, side);
      break;
    case 'use_ultimate':
      res = realEngine.useUltimate(state, side, action.ultId);
      break;
    case 'counter': {
      const la = realEngine.getLegalActions(state);
      const card = la.cards?.find((c) => (c.instanceId || c.id || c.name) === (action.cardInstanceId || action.cardKey)) || la.cards?.find((c) => c.name === action.cardName);
      if (!card) return state;
      res = realEngine.counter(state, side, card.name, { movePath: action.movePath || null });
      break;
    }
    case 'struggle':
      res = realEngine.struggle(state, side, { burst: false });
      break;
    case 'pass':
      res = realEngine.passResponse(state, side);
      break;
    case 'burst_struggle':
      res = realEngine.struggle(state, side, { burst: true });
      break;
    case 'scry_order': {
      const draft = clone(state);
      const choice = getPendingChoiceOptions(draft);
      if (!choice || choice.id !== action.choiceId || choice.type !== 'DECK_ORDER') return state;
      // 稳定身份优先：牌序事务跨层传 cardInstanceId；cardNames 仅保留兼容。
      const pool = choice.cards.slice();
      const order = [];
      const ids = action.cardInstanceIds || [];
      if (ids.length) {
        for (const id of ids) {
          const i = pool.findIndex(c => (c.instanceId || c.id || c.name) === id);
          if (i < 0) return state;
          order.push(pool.splice(i, 1)[0]);
        }
      } else {
        for (const name of action.cardNames || []) {
          const i = pool.findIndex(c => c.name === name);
          if (i < 0) return state;
          order.push(pool.splice(i, 1)[0]);
        }
      }
      if (pool.length || order.length !== choice.cards.length) return state;
      submitPendingChoice(draft, choice.id, order);
      res = { ok: true, state: draft, result: { choiceId: choice.id, order: order.map(c => c.name) } };
      break;
    }
    case 'supply_choice': {
      // 补给结算会原地修改传入状态。必须先克隆并返回新对象，
      // 否则AI候选评分会污染真实状态，UI也会把成功动作误判为拒绝。
      const supplyDraft = clone(state);
      res = realEngine.resolveSupplyChoice(supplyDraft, side, action.option);
      if (res && res.ok !== false) res = { ok: true, state: supplyDraft, result: res };
      break;
    }
    case 'end':
    default: {
      // 收势：PRE_ATTACK/CHASE_WINDOW 调 endExpansion；RESPONSE_WINDOW 调 passResponse（防守方放弃响应）；
      // EXPANSION_END 无需操作（引擎自动推进）——防御性返回原 state
      if (state.phase === 'PRE_ATTACK' || state.phase === 'CHASE_WINDOW') {
        res = realEngine.endExpansion(state, side);
      } else if (state.phase === 'RESPONSE_WINDOW') {
        // 不反击不挣脱 = 放弃响应：调 passResponse 让挂起的牌继续结算，不弃牌。
        // RESPONSE_WINDOW 必须显式传防守方，不能读取兼容镜像 turn。
        const defenderSide = state.pendingCard ? 1 - state.pendingCard.attackerSide : 1 - ruleInitiativeSide(state);
        res = realEngine.passResponse(state, defenderSide);
      } else {
        return state;
      }
      break;
    }
  }

  if (!res) return state;
  if (res.ok === false) {
    // 事务失败：记录失败动作签名，本回合 simGetLegalActions 不再列出，防空转
    if (!state._failedActions) state._failedActions = new Set();
    state._failedActions.add(actionSignature(state, action));
    return state;
  }
  const next = res.state ?? state;
  wrapState(next, state.heroA, state.heroB);
  // 相位推进是引擎契约的一部分；适配器禁止直接改 phase。
  // 回合或相位变化时清空失败记录（距离/费用条件已变）
  if (ruleActorSide(next) !== ruleActorSide(state) || next.phase !== state.phase || next.expansionCount !== state.expansionCount) {
    next._failedActions = new Set();
  } else {
    next._failedActions = state._failedActions ?? new Set();
  }
  updateStats(next);
  return next;
}

/**
 * 动作签名（用于失败去重）。
 * @param {Object} state
 * @param {Object} action
 * @returns {string}
 */
function actionSignature(state, action) {
  switch (action.kind) {
    case 'play_card':
    case 'counter':
      return `${state.phase}:${action.cardName}`;
    case 'tactical_step':
      return `step:${action.dir}`;
    case 'use_skill':
      return `skill:${action.skillId}`;
    case 'use_ultimate':
      return `ult:${action.ultId}`;
    case 'rejuvenate':
      return 'rejuvenate';
    default:
      return action.kind;
  }
}

const __default_sim_realEngineAdapter_js = { simNewGame, simGetLegalActions, applyAction };




function sideIndex(side) {
  if (side === 'A' || side === 0) return 0;
  if (side === 'B' || side === 1) return 1;
  throw new Error(`非法 side: ${side}`);
}

function publicCardView(card) {
  if (!card) return null;
  return { instanceId: card.instanceId || card.id || null, name: card.name, type: card.type, timing: card.timing, cost: card.cost ?? 0, damage: card.damage ?? 0, range: card.range ?? 0, effect: card.effect ?? '', condition: clone(card.condition ?? ''), rulesText:card.rulesText ?? '', artKey:card.artKey ?? card.name };
}
function hiddenCardView() { return { hidden:true }; }
function publicPlayerView(p, revealHand) {
  return {
    hero:p.hero?clone(p.hero):null,hp:p.hp,energy:p.energy,qi:p.qi,pos:p.pos?{...p.pos}:null,
    handCount:p.hand?.length||0,hand:revealHand?(p.hand||[]).map(publicCardView):undefined,
    deckCount:p.deck?.length||0,discard:(p.discard||[]).map(publicCardView),
    statusSlots:clone(p.statusSlots),ultimatesUsed:[...(p.ultimatesUsed||[])]
  };
}
function sanitizeLogForObservation(log) {
  // Logs are public combat narration. Strip any accidental deck-order/card-pool payloads.
  return (log||[]).map(e => {
    const x=clone(e);
    for (const k of ['deck','deckOrder','topCards','cards','cardPool','privateCards']) if (Object.prototype.hasOwnProperty.call(x,k)) x[k]='[redacted]';
    return x;
  });
}
function getObservationForSide(state, side) {
  const viewer = sideIndex(side);
  // UI-compatible observation: preserve public/renderable shape while redacting all hidden card identity
  // and engine-only mutation/control fields.
  const obs = clone(state);
  obs.version = ENGINE_CORE_VERSION;
  obs.viewerSide = viewer;
  obs.heroA = state.heroA;
  obs.heroB = state.heroB;
  obs.currentPlayer = ruleActorSide(state)===0?'A':'B';
  obs.winnerAB = state.winner==null?null:(state.winner==='draw'?'DRAW':(state.winner===0?'A':'B'));
  obs.roundOwner = state.roundOwner ?? state.roundFirstPlayer ?? null;
  obs.mainActionSide = state.mainActionSide ?? null;
  obs.initiativeSide = state.expansion?.initiativeSide ?? state.initiativeSide ?? null;
  delete obs.rngState;
  delete obs.idCounters;
  delete obs._failedActions;
  delete obs._statsAcc;

  for (let i=0;i<obs.players.length;i++) {
    const src=state.players[i], p=obs.players[i];
    p.handCount = src.hand?.length || 0;
    p.deckCount = src.deck?.length || 0;
    p.hand = i===viewer ? (src.hand||[]).map(c=>clone(c)) : (src.hand||[]).map(hiddenCardView);
    // Deck order is hidden from both sides; scry-visible cards only travel through owned PendingChoice.
    p.deck = (src.deck||[]).map(hiddenCardView);
  }

  if (state.pendingChoice) {
    if (state.pendingChoice.side === viewer) {
      const choice=getPendingChoiceOptions(state);
      obs.pendingChoice = choice ? clone(choice) : null;
    } else {
      obs.pendingChoice = { id:state.pendingChoice.id, type:state.pendingChoice.type, side:state.pendingChoice.side, private:true };
    }
  }
  if (obs.deckOrderTransaction && obs.deckOrderTransaction.side !== viewer) {
    obs.deckOrderTransaction={id:obs.deckOrderTransaction.id,type:obs.deckOrderTransaction.type,side:obs.deckOrderTransaction.side,private:true};
  }
  obs.log=sanitizeLogForObservation(state.log);
  return obs;
}

function assertCoreInvariants(state) {
  const fail = (m) => { throw new Error(`ENGINE_INVARIANT: ${m}`); };
  const forbiddenExpansionMirrors = ['movedThisExpansion','healedThisExpansion','damageTakenThisExpansion','selfDamageThisExpansion','cardsPlayedThisExpansion','attacksThisExpansion','expansionAttackCards'];
  for (const [side,p] of state.players.entries()) {
    for (const key of forbiddenExpansionMirrors) if (Object.prototype.hasOwnProperty.call(p.mechanics || {}, key)) fail(`P${side} mechanics 禁止展开账本镜像 ${key}`);
  }
  if (![0,1,'draw',null,undefined].includes(state.winner)) fail('winner 非法');
  if (state.expansion) {
    if (![0,1].includes(state.expansion.initiativeSide)) fail('展开缺少 initiativeSide');
    if (state.initiativeSide !== state.expansion.initiativeSide) fail('initiativeSide 镜像与展开事实源不一致');
  }
  if (state.phase === PHASE.CHASE_WINDOW && !state.expansion) fail('CHASE_WINDOW 必须存在 expansion');
  if (state.phase === PHASE.RESPONSE_WINDOW && !state.pendingCard) fail('RESPONSE_WINDOW 必须存在 pendingCard');
  if (state.pendingChoice && ![0,1].includes(state.pendingChoice.side)) fail('PendingChoice 必须绑定一方');
  return true;
}
function engineStateDigest(state) {
  const raw = JSON.stringify({phase:state.phase,round:state.round,section:state.section,expansionCount:state.expansionCount,
    turn:state.turn,initiativeSide:state.expansion?.initiativeSide??state.initiativeSide,winner:state.winner,rngState:state.rngState,
    players:state.players.map(p=>({hp:p.hp,energy:p.energy,qi:p.qi,pos:p.pos,
      hand:(p.hand||[]).map(c=>c.instanceId||c.name),deck:(p.deck||[]).map(c=>c.instanceId||c.name),
      discard:(p.discard||[]).map(c=>c.instanceId||c.name)}))});
  let h=2166136261>>>0; for(let i=0;i<raw.length;i++){h^=raw.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}
  return h.toString(16).padStart(8,'0');
}
const __corePrivate = new WeakMap();
function __coreData(core) {
  const d=__corePrivate.get(core);
  if(!d) throw new Error('非法 GameEngineCore 实例');
  return d;
}
function __deepFreeze(x, seen=new WeakSet()) {
  if(!x || typeof x!=='object' || seen.has(x)) return x;
  seen.add(x); for(const v of Object.values(x)) __deepFreeze(v,seen); return Object.freeze(x);
}

class GameEngineCore {
  constructor(config) {
    if (!config?.heroA || !config?.heroB) throw new Error('GameEngineCore 需要 heroA/heroB');
    const normalized={heroA:config.heroA, heroB:config.heroB, firstPlayer:config.firstPlayer || 'A', seed:config.seed, map:config.map};
    const state=simNewGame(config.heroA,config.heroB,normalized);
    assertCoreInvariants(state);
    __corePrivate.set(this,{config:normalized,state,commands:[]});
    Object.freeze(this);
  }
  getObservationForSide(side){ return getObservationForSide(__coreData(this).state,side); }
  getLegalActions(side){
    const d=__coreData(this), idx=sideIndex(side), actor=ruleActorSide(d.state);
    return idx===actor ? simGetLegalActions(d.state).map(a=>clone(a)) : [];
  }
  dispatch(command){
    const d=__coreData(this), before=d.state;
    const eventDelta=[];
    __activeCommandEventSink=eventDelta;
    let next;
    try { next=applyAction(before,clone(command)); }
    finally { __activeCommandEventSink=null; }
    if(next===before) return {ok:false,error:'COMMAND_REJECTED',events:[],stateDigest:engineStateDigest(before)};
    d.state=next; assertCoreInvariants(d.state); d.commands.push(clone(command));
    return {ok:true,events:eventDelta.map(e=>clone(e)),
      eventSequence:eventDelta.length?{from:eventDelta[0].sequence,to:eventDelta[eventDelta.length-1].sequence}:null,
      pendingChoice:d.state.pendingChoice?getPendingChoiceOptions(d.state):null,
      stateDigest:engineStateDigest(d.state)};
  }
  exportReplay(){ const d=__coreData(this); return {engineCoreVersion:ENGINE_CORE_VERSION,gameplayVersion:V7_CORE_VERSION,
    config:clone(d.config),commands:clone(d.commands),finalDigest:engineStateDigest(d.state)}; }
  getStateDigest(){ return engineStateDigest(__coreData(this).state); }
  queryCardCost(side, cardRef, isFollow=false){
    const d=__coreData(this), idx=sideIndex(side);
    const card=(d.state.players[idx].hand||[]).find(c=>(c.instanceId||c.id||c.name)===cardRef || c.name===cardRef);
    if(!card) return null;
    return computeCost(d.state,idx,card,!!isFollow);
  }
  queryReachableMovePaths(side,maxSteps,opts={}) {
    const d=__coreData(this); return clone(getReachableMovePaths(d.state,sideIndex(side),maxSteps,opts));
  }
  static replay(replay){
    const e=new GameEngineCore(replay.config);
    for(const c of replay.commands||[]){const r=e.dispatch(c);if(!r.ok)throw new Error(`Replay command rejected: ${c.actionId||c.kind}`);}
    return e;
  }
}

function __createAI(strategy, heroId, side='B', seed=1) {
  const idx=sideIndex(side), rng=mulberry32(deriveSeed(seed,`AI-${idx}-${heroId}`)), fn=resolveAI(strategy,heroId);
  return Object.freeze({
    choose(core){
      const d=__coreData(core);
      if(ruleActorSide(d.state)!==idx) return null;
      const legal=core.getLegalActions(idx);
      if(!legal.length) return null;
      // AI receives the same redacted Observation contract as a remote client, never internal GameState.
      const obs=getObservationForSide(d.state,idx);
      try {
        const action=fn(obs,legal,{rng,heroId,playerId:idx===0?'A':'B',opponentId:idx===0?'B':'A',engine:null});
        if(action && legal.some(a=>a.actionId===action.actionId)) return clone(action);
      } catch(_) {}
      return clone(legal[Math.floor(rng()*legal.length)] || legal[0]);
    }
  });
}

const __publicCatalog = __deepFreeze(clone({HEROES,HEX_MAP_DATA}));
const GameEngineFacade = Object.freeze({
  version: ENGINE_CORE_VERSION,
  gameplayVersion: V7_CORE_VERSION,
  createGame(config){ return new GameEngineCore(config); },
  replay(replay){ return GameEngineCore.replay(replay); },
  createAI(strategy,heroId,side='B',seed=1){ return __createAI(strategy,heroId,side,seed); },
  catalog: __publicCatalog
});
function explainConditionFailure(condition, ctx) {
  const r=evaluateCondition(condition,ctx);
  return r.ok ? [] : r.failedReasons.slice();
}
function passExpansionInitiative(state, side) {
  if(!state.expansion)throw new Error('当前没有展开');
  if(state.expansion.initiativeSide!==side)throw new Error('只有展开主动方可以收势');
  return endExpansion(state,side);
}
function createResponseWindow(state,{type='ATTACK',sourceActionId=null,responderSide,allowedResponses=[]}={}) {
  const rw={id:nextV701Id(state,'response'),type,sourceActionId,responderSide,allowedResponses:allowedResponses.slice(),
    status:'OPEN',openedAtEventId:state.expansion?.eventLedger.events.at(-1)?.eventId||null,resolvedBy:null};
  state.responseWindow=rw;
  emitV7Event(state,{type:'RESPONSE_WINDOW_OPENED',actorId:responderSide,responseWindowId:rw.id,payload:{allowedResponses:rw.allowedResponses}});
  return rw;
}
function closeResponseWindow(state,resolution='PASS') {
  if(!state.responseWindow)return null;
  state.responseWindow.status='CLOSED';state.responseWindow.resolvedBy=resolution;
  emitV7Event(state,{type:'RESPONSE_WINDOW_CLOSED',responseWindowId:state.responseWindow.id,payload:{resolution}});
  const out=state.responseWindow;state.responseWindow=null;return out;
}
function getV701Ownership(state){
  syncOwnershipMirrors(state);
  return {roundFirstPlayer:state.roundFirstPlayer??state.roundOwner,roundOwner:state.roundOwner,mainActionSide:state.mainActionSide,initiativeSide:state.expansion?.initiativeSide??state.initiativeSide,attackCount:state.expansion?.attackCount||0,maxAttacks:state.expansion?.maxAttacks||8,initiativeTransferCount:state.expansion?.initiativeTransferCount||0,maxInitiativeTransfers:state.expansion?.maxInitiativeTransfers||1};
}

global.GameEngine = GameEngineFacade;
global.V6 = { V7_CORE_VERSION, ENGINE_CORE_VERSION, GameEngineCore, PHASE, PHASE_ACTIONS, POSTURE, CONTROL, PERSISTENT, INSTANT, CONDITION, EFFECT, CONST, PIPELINE, HEROES, TILE, TERRAIN_RULE, SHRINK_STAGES, RESOURCE_TIERS, HEX_MAP_DATA, HEX_DIRS, AI_REGISTRY, TACTICAL_WEIGHTS, V71_ROLE_PROFILES, makeStatus, makeResolutionLog, makePlayerState, makeStatusSlots, makeGameState, makeBoard, getPosture, setPosture, addStatus, removeStatus, hasStatus, getStatus, consumeInstant, peekInstant, clearExpired, clone, fxKnock, fxKnock2, fxAir, fxDown, fxStiff, fxSeal, fxMove, fxMove2, fxEvade, fxGuard, fxDraw, fxDraw2, fxSelfhurt, fxFeather, fxFly, fxZone, fxMoveenergy, fxQi, fxClean, fxHeal, fxGuardqi, fxStop, fxCycle, fxScry, fxDiscard, fxDiscount, fxBuffLuojiRoar, fxBuffChiyuHorn, fxBuffLafengGlory, fxDraw2Selfhurt, fxFlyDraw, fxFlyDrawQi, fxBuffQiuHormone, fxBuffBaiyeWater, fxBuffBaiyeWind, fxBuffLanyuCry, fxBuffXuanyiDef, validateRegistry, oddrToAxial, axialToOddr, hexDistance, boardCell, hexStep, canTraverse, hexBestToward, hexAwayDirection, dist, isWalkable, cellTerrain, edgeForMove, getReachableMovePaths, applySelectedMovePath, effectiveRange, engineResourceTier, heal, gainQi, gainBaiyeFeather, random, drawCards, lanyuFreeFlyAvailable, enterFlying, cycleCard, beginDeckOrderTransaction, peekTopCards, getPendingChoiceOptions, submitPendingChoice, commitDeckOrder, cancelDeckOrderTransaction, scry, discardRandom, shuffle, damage, knockback, finalizeMoveMechanics, moveToward, moveTowardWithinBudget, canBridgeToRange, moveSelectedOrToward, moveAway, drainEnergy, nextV701Id, makeExpansionLedger, ruleMainActionSide, ruleInitiativeSide, ruleActorSide, setMainActionSide, startExpansion, transferExpansionInitiative, syncOwnershipMirrors, ensureExpansion, emitV7Event, ledgerScopeEvents, v7LedgerValue, ledgerHasEventType, expansionHistoryFact, compareValue, evaluateCondition, checkLegacyCondition, checkCondition, computeCost, payCost, resolveCard, isSuccessfulCounterResolution, continueResolution, expansionEndPipeline, _finishExpansion, resolveSupplyChoice, shrinkZone, transact, v66FindCard, v66PatchCard, v66PatchSkill, v66PatchUlt, v66PatchMechanic, v71PatchCard, v71PatchSkill, v71PatchUltimate, buildBoard, shrinkZoneTiles, resourceTier, buildTerrainBoard, newGame, ultimateValidationError, getLegalActions, skillCost, skillValidationError, playCard, tacticalStep, useSkill, applySkill, gainFeather, gainFate, reshuffle, addStatusSafe, setPostureSafe, useRejuvenate, useUltimate, counter, struggle, passResponse, endExpansion, mulberry32, hashSeed, deriveSeed, pick, randInt, isAttackAction, isMoveAction, isHealAction, isResourceAction, ofKind, immediateDamage, costOf, efficiency, readStatusIds, readPosture, readPlayerView, distance, randomAI, greedyAI, tacticalAI, v66ComboLookahead, v71ComboSolver, v71RoleActionBonus, tacticalWithWeights, inferPhase, roleWeights, roleAI, resolveAI, simNewGame, wrapState, updateStats, viewPlayer, stableActionPayload, makeActionId, decorateLegalActions, simGetLegalActions, applyAction, actionSignature, sideIndex, publicCardView, publicPlayerView, getObservationForSide, assertCoreInvariants, engineStateDigest, explainConditionFailure, passExpansionInitiative, createResponseWindow, closeResponseWindow, getV701Ownership }
})(typeof window !== 'undefined' ? window : globalThis);
