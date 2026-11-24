/** 竞彩足球 / 竞篮：玩法定义与方案计算用到的数据结构 */

/** 玩法标识：与接口返回的赔率分组一一对应 */
export type PoolCode = 'HAD' | 'HHAD' | 'HAFU' | 'TTG' | 'CRS' | 'MNL' | 'HDC' | 'HILO' | 'WNM'

/** 项目类型：竞足 / 竞篮 */
export type SportKey = 'football' | 'basketball'
/** SportKey 的旧命名，保留兼容 */
export type GameTypeKey = SportKey

export interface OptionDef {
  key: string
  label: string
}

/** 各玩法的名称、弹窗列数与选项定义 */
export const POOL_DEFS: Record<PoolCode, { name: string; columns: 2 | 3 | 4; options: OptionDef[] }> = {
  HAD: {
    name: '胜平负',
    columns: 3,
    options: [
      { key: 'h', label: '胜' },
      { key: 'd', label: '平' },
      { key: 'a', label: '负' },
    ],
  },
  HHAD: {
    name: '让球胜平负',
    columns: 3,
    options: [
      { key: 'h', label: '让胜' },
      { key: 'd', label: '让平' },
      { key: 'a', label: '让负' },
    ],
  },
  HAFU: {
    name: '半全场',
    columns: 3,
    options: [
      { key: 'hh', label: '胜胜' },
      { key: 'hd', label: '胜平' },
      { key: 'ha', label: '胜负' },
      { key: 'dh', label: '平胜' },
      { key: 'dd', label: '平平' },
      { key: 'da', label: '平负' },
      { key: 'ah', label: '负胜' },
      { key: 'ad', label: '负平' },
      { key: 'aa', label: '负负' },
    ],
  },
  TTG: {
    name: '总进球',
    columns: 4,
    options: [
      { key: 's0', label: '0球' },
      { key: 's1', label: '1球' },
      { key: 's2', label: '2球' },
      { key: 's3', label: '3球' },
      { key: 's4', label: '4球' },
      { key: 's5', label: '5球' },
      { key: 's6', label: '6球' },
      { key: 's7', label: '7+球' },
    ],
  },
  CRS: {
    name: '比分',
    columns: 4,
    options: [
      { key: 's01s00', label: '1:0' },
      { key: 's02s00', label: '2:0' },
      { key: 's02s01', label: '2:1' },
      { key: 's03s00', label: '3:0' },
      { key: 's03s01', label: '3:1' },
      { key: 's03s02', label: '3:2' },
      { key: 's04s00', label: '4:0' },
      { key: 's04s01', label: '4:1' },
      { key: 's04s02', label: '4:2' },
      { key: 's05s00', label: '5:0' },
      { key: 's05s01', label: '5:1' },
      { key: 's05s02', label: '5:2' },
      { key: 's1sh', label: '胜其他' },
      { key: 's00s00', label: '0:0' },
      { key: 's01s01', label: '1:1' },
      { key: 's02s02', label: '2:2' },
      { key: 's03s03', label: '3:3' },
      { key: 's1sd', label: '平其他' },
      { key: 's00s01', label: '0:1' },
      { key: 's00s02', label: '0:2' },
      { key: 's01s02', label: '1:2' },
      { key: 's00s03', label: '0:3' },
      { key: 's01s03', label: '1:3' },
      { key: 's02s03', label: '2:3' },
      { key: 's00s04', label: '0:4' },
      { key: 's01s04', label: '1:4' },
      { key: 's02s04', label: '2:4' },
      { key: 's00s05', label: '0:5' },
      { key: 's01s05', label: '1:5' },
      { key: 's02s05', label: '2:5' },
      { key: 's1sa', label: '负其他' },
    ],
  },
  MNL: {
    name: '胜负',
    columns: 2,
    options: [
      { key: 'h', label: '主胜' },
      { key: 'a', label: '客胜' },
    ],
  },
  HDC: {
    name: '让分胜负',
    columns: 2,
    options: [
      { key: 'h', label: '主让胜' },
      { key: 'a', label: '客让胜' },
    ],
  },
  HILO: {
    name: '大小分',
    columns: 2,
    options: [
      { key: 'h', label: '大分' },
      { key: 'l', label: '小分' },
    ],
  },
  WNM: {
    name: '胜分差',
    columns: 4,
    options: [
      { key: 'w1', label: '主胜1-5' },
      { key: 'w2', label: '主胜6-10' },
      { key: 'w3', label: '主胜11-15' },
      { key: 'w4', label: '主胜16-20' },
      { key: 'w5', label: '主胜21-25' },
      { key: 'w6', label: '主胜26+' },
      { key: 'l1', label: '客胜1-5' },
      { key: 'l2', label: '客胜6-10' },
      { key: 'l3', label: '客胜11-15' },
      { key: 'l4', label: '客胜16-20' },
      { key: 'l5', label: '客胜21-25' },
      { key: 'l6', label: '客胜26+' },
    ],
  },
}

/** 比赛卡片上直接铺开的玩法 */
export const PRIMARY_POOLS: Record<SportKey, PoolCode[]> = {
  football: ['HAD', 'HHAD'],
  basketball: ['MNL', 'HDC', 'HILO'],
}

/** 「更多玩法」中展开的玩法 */
export const EXTRA_POOLS: Record<SportKey, PoolCode[]> = {
  football: ['HAFU', 'TTG', 'CRS'],
  basketball: ['WNM'],
}

/** 归一化赛程时按顺序解析的玩法 */
export const ALL_POOLS: Record<SportKey, PoolCode[]> = {
  football: ['HAD', 'HHAD', 'HAFU', 'TTG', 'CRS'],
  basketball: ['MNL', 'HDC', 'HILO', 'WNM'],
}

export const SPORTS: { key: SportKey; label: string }[] = [
  { key: 'football', label: '竞足' },
  { key: 'basketball', label: '竞篮' },
]

export function sportLabel(sport: SportKey): string {
  return SPORTS.find((item) => item.key === sport)?.label ?? '竞足'
}

/** 单场投注上限（竞彩过关最多 8 场） */
export const MAX_MATCH = 8
/** 每注单价 2 元 */
export const UNIT_PRICE = 2
/** 常用倍数 */
export const MULTIPLE_PRESETS = [10, 20, 50, 100]
/** 数字键盘按键 */
export const KEYPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '确认倍数', '0', '删除']

export function passLabel(size: number): string {
  return size === 1 ? '单关' : `${size}串1`
}

export const PASS_OPTIONS = Array.from({ length: MAX_MATCH }, (_, index) => index + 1).map((size) => ({
  size,
  label: passLabel(size),
}))

/** 多串过关：一次投注同时覆盖多种串法（如 3串4 = 3 个 2串1 + 1 个 3串1） */
export interface MultiPassOption {
  id: string
  label: string
  sizes: number[]
}

/** 竞彩常见的递增档位：每档都是「上一档 + 全部命中」的累加结果 */
export const MULTI_PASS_OPTIONS: MultiPassOption[] = [
  { id: 'p3x4', label: '3串4', sizes: [2, 3] },
  { id: 'p4x11', label: '4串11', sizes: [2, 3, 4] },
  { id: 'p5x26', label: '5串26', sizes: [2, 3, 4, 5] },
]

/** 多串 id -> 参与求和的串法；未知 id 返回空数组，由调用方决定回落方式 */
export function passSizesOf(id: string): number[] {
  const option = MULTI_PASS_OPTIONS.find((item) => item.id === id)
  // 返回副本，避免调用方改动共享常量
  return option ? [...option.sizes] : []
}

/** 可投注玩法的单个选项 */
export interface OddsOption {
  key: string
  label: string
  odds: number
}

/** 单个玩法行：同一让球 / 让分 / 大小分档位下的所有选项 */
export interface PoolRow {
  poolCode: PoolCode
  title: string
  line: string
  options: OddsOption[]
}

/** 归一化后的单场比赛 */
export interface SportMatch {
  matchId: number
  matchNum: number
  matchNumStr: string
  matchWeek: string
  businessDate: string
  matchDate: string
  matchTime: string
  league: string
  homeTeam: string
  awayTeam: string
  homeRank: string
  awayRank: string
  /** 赛事颜色（接口返回的十六进制色值，不含 #） */
  backColor: string
  /** 1 表示支持单关投注 */
  bettingSingle: number
  rows: PoolRow[]
}

/** 归一化后的赛程 */
export interface SportSchedule {
  sport: SportKey
  dates: string[]
  matches: SportMatch[]
  updateTime: string
}

/** 方案中的一场比赛选择 */
export interface PlanLeg {
  sport: SportKey
  matchId: number
  matchNumStr: string
  league: string
  matchDate: string
  homeTeam: string
  awayTeam: string
  poolCode: PoolCode
  poolName: string
  /** 让球 / 让分 / 大小分的盘口值，如 -1、+220.5 */
  goalLine: string
  optionKey: string
  optionLabel: string
  odds: number
}

/** 每场比赛的已选统计 */
export interface MatchSelectionStat {
  optionCount: number
  maxOdds: number
  minOdds: number
}

export interface SelectionSummary {
  /** 已选场次 */
  matchCount: number
  /** 已选选项总数 */
  optionCount: number
  /** 过关方式展开后的组合个数 */
  parlayCount: number
  /** 总注数（所有选项展开） */
  betCount: number
  multiple: number
  /** 总金额 = 注数 × 2 元 × 倍数 */
  amount: number
  /** 理论最高 / 最低奖金 */
  maxBonus: number
  minBonus: number
}

export type ScheduleStatus = 'loading' | 'ready' | 'error'
