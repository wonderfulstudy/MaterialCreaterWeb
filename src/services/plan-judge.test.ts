import Taro from '@tarojs/taro'
import { configureCore } from '@mc/core/platform'
import type { KeyValueStore } from '@mc/core/platform/storage'
import {
  mapBasketballResults,
  mapFootballResults,
  type SportMatchResult,
  type TraditionalDraw,
} from '@/api/lottery/results'
import type { PlanLeg, PoolCode } from '@/components/PlanCalculator/model'
import { taroFeedback } from '@/platform/taro-feedback'
import { taroTransport } from '@/platform/taro-transport'
import { judgeLegs, judgePlan, type MatchResults } from './plan-result'
import { findDay, listDays, saveDay, type StoredPlanDay } from './plan-store'
import {
  JUDGE_WINDOW_DAYS,
  judgePlans,
  judgeRecentPlans,
  toMatchResults,
  traditionalResults,
  type JudgeSources,
  type JudgeValue,
} from './plan-judge'

jest.mock('@tarojs/taro', () => ({
  __esModule: true,
  default: {
    getStorageSync: jest.fn(),
    setStorageSync: jest.fn(),
    request: jest.fn(),
  },
}))

interface TaroMock {
  getStorageSync: jest.Mock
  setStorageSync: jest.Mock
  request: jest.Mock
}

const taro = Taro as unknown as TaroMock
const storage = new Map<string, unknown>()

/** 实现已迁到 @mc/core：把平台存储接回本文件 mock 的 Taro（core 以 JSON 字符串落盘）
 *  文件级一次注入，13 条判中用例共享同一份 store；remove 与 set/get 都落在本文件的 storage Map 上 */
const coreStorage: KeyValueStore = {
  get(key) {
    const value = taro.getStorageSync(key)
    return value === '' || value === undefined || value === null
      ? null
      : typeof value === 'string'
        ? value
        : JSON.stringify(value)
  },
  set(key, value) {
    taro.setStorageSync(key, JSON.parse(value) as unknown)
  },
  remove(key) {
    storage.delete(key)
  },
}

configureCore({ transport: taroTransport, storage: coreStorage, feedback: taroFeedback, apiBaseUrl: '' })

beforeEach(() => {
  storage.clear()
  taro.getStorageSync.mockImplementation((key: string) => (storage.has(key) ? storage.get(key) : ''))
  taro.setStorageSync.mockImplementation((key: string, value: unknown) => {
    storage.set(key, value)
  })
})

// ============ fixture（全部固定，不联网） ============

const FOOTBALL_DATE = '2026-11-23'
const TRADITIONAL_DATE = '2026-11-22'

const dateTime = (date: string) => date + ' 20:00'

/** 竞彩足球：3001 主胜 2:1（半场 1:0，让球 -1）、3002 平 0:0（让球 +1）、3003 未开奖 */
const FOOTBALL_RESULTS: SportMatchResult[] = mapFootballResults([
  {
    matchId: 3001,
    matchDate: dateTime(FOOTBALL_DATE),
    sectionsNo1: '1:0',
    sectionsNo999: '2:1',
    goalLine: '-1',
    winFlag: 'H',
    matchResultStatus: '2',
  },
  {
    matchId: 3002,
    matchDate: dateTime(FOOTBALL_DATE),
    sectionsNo1: '0:0',
    sectionsNo999: '0:0',
    goalLine: '1',
    winFlag: 'D',
    matchResultStatus: '2',
  },
  { matchId: 3003, matchDate: dateTime(FOOTBALL_DATE), matchResultStatus: '1' },
])

/** 竞彩篮球：4001 125-103（让分 -5.5 / 大小分 220.5）、4002 100-110（盘口在 matchResultList 里）、4003 未开奖 */
const BASKETBALL_RESULTS: SportMatchResult[] = mapBasketballResults([
  {
    matchId: 4001,
    matchDate: FOOTBALL_DATE + ' 09:00',
    finalScore: '125-103',
    hdc: { poolCode: 'hdc', goalLine: '-5.5' },
    hilo: { poolCode: 'hilo', goalLine: '220.5' },
  },
  {
    matchId: 4002,
    matchDate: FOOTBALL_DATE + ' 09:00',
    finalScore: '100-110',
    matchResultList: [
      { poolCode: 'hdc', goalLine: '+3.5' },
      { poolCode: 'hilo', goalLine: '210.5' },
    ],
  },
  { matchId: 4003, matchDate: FOOTBALL_DATE + ' 09:00' },
])

/** 传足 14 场：场序 1..14 依次 3/1/0 循环 */
const TRADITIONAL_CODES = ['3', '1', '0', '3', '1', '0', '3', '1', '0', '3', '1', '0', '3', '1']
const TRADITIONAL_DRAWS: TraditionalDraw[] = [
  { issue: '26167', drawDate: dateTime(TRADITIONAL_DATE), results: TRADITIONAL_CODES },
]

type DayKind = 'football' | 'basketball' | 'traditional'

const RESULTS: Record<DayKind, MatchResults> = {
  football: toMatchResults(FOOTBALL_RESULTS, 'football', FOOTBALL_DATE),
  basketball: toMatchResults(BASKETBALL_RESULTS, 'basketball', FOOTBALL_DATE),
  traditional: traditionalResults(TRADITIONAL_DRAWS, TRADITIONAL_DATE),
}

function makeLeg(overrides: Partial<PlanLeg>): PlanLeg {
  return {
    sport: 'football',
    matchId: 3001,
    matchNumStr: '周一001',
    league: '英超',
    matchDate: dateTime(FOOTBALL_DATE),
    homeTeam: '主队',
    awayTeam: '客队',
    poolCode: 'HAD',
    poolName: '胜平负',
    goalLine: '',
    optionKey: 'h',
    optionLabel: '胜',
    odds: 1.5,
    ...overrides,
  }
}

function makeDay(overrides: Partial<StoredPlanDay>): StoredPlanDay {
  return {
    planId: 'plan-1',
    date: FOOTBALL_DATE,
    sport: 'football',
    multiple: 1,
    passIds: ['pass-1'],
    legs: [makeLeg({})],
    summary: {
      matchCount: 1,
      optionCount: 1,
      parlayCount: 1,
      betCount: 1,
      multiple: 1,
      amount: 2,
      maxBonus: 3,
      minBonus: 3,
    },
    rest: false,
    updatedAt: 1,
    ...overrides,
  }
}

function makeSources(overrides: Partial<JudgeSources> = {}): JudgeSources {
  return {
    football: async () => FOOTBALL_RESULTS,
    basketball: async () => BASKETBALL_RESULTS,
    traditional: async () => TRADITIONAL_DRAWS,
    ...overrides,
  }
}

/** 用一腿跑一遍纯判定（适配层 + plan-result），不碰 storage */
function legResult(leg: PlanLeg, kind: DayKind): JudgeValue {
  return judgeLegs([leg], RESULTS[kind])[0].result
}

// ============ AC-2：各玩法 命中 / 未中 / pending 矩阵 ============

interface Case {
  name: string
  kind: DayKind
  pool: PoolCode
  matchId: number
  optionKey: string
  goalLine?: string
  matchDate?: string
  expected: JudgeValue
}

const CASES: Case[] = [
  // 足球 胜平负
  { name: '足球 HAD 命中：2:1 判 主胜', kind: 'football', pool: 'HAD', matchId: 3001, optionKey: 'h', expected: 'hit' },
  { name: '足球 HAD 未中：2:1 判 主胜，选负', kind: 'football', pool: 'HAD', matchId: 3001, optionKey: 'a', expected: 'miss' },
  { name: '足球 HAD pending：未开奖', kind: 'football', pool: 'HAD', matchId: 3003, optionKey: 'h', expected: 'pending' },
  // 足球 让球胜平负
  { name: '足球 HHAD 命中：2:1 让 -1 判 让平', kind: 'football', pool: 'HHAD', matchId: 3001, optionKey: 'd', goalLine: '-1', expected: 'hit' },
  { name: '足球 HHAD 未中：2:1 让 -1 判 让平，选让胜', kind: 'football', pool: 'HHAD', matchId: 3001, optionKey: 'h', goalLine: '-1', expected: 'miss' },
  { name: '足球 HHAD pending：腿上没有盘口', kind: 'football', pool: 'HHAD', matchId: 3001, optionKey: 'd', expected: 'pending' },
  // 足球 比分
  { name: '足球 CRS 命中：2:1 精确比分', kind: 'football', pool: 'CRS', matchId: 3001, optionKey: 's02s01', expected: 'hit' },
  { name: '足球 CRS 未中：2:1 不是胜其他', kind: 'football', pool: 'CRS', matchId: 3001, optionKey: 's1sh', expected: 'miss' },
  { name: '足球 CRS pending：未开奖', kind: 'football', pool: 'CRS', matchId: 3003, optionKey: 's02s01', expected: 'pending' },
  // 足球 总进球
  { name: '足球 TTG 命中：3 球', kind: 'football', pool: 'TTG', matchId: 3001, optionKey: 's3', expected: 'hit' },
  { name: '足球 TTG 未中：3 球不是 2 球', kind: 'football', pool: 'TTG', matchId: 3001, optionKey: 's2', expected: 'miss' },
  { name: '足球 TTG pending：未开奖', kind: 'football', pool: 'TTG', matchId: 3003, optionKey: 's3', expected: 'pending' },
  // 足球 半全场
  { name: '足球 HAFU 命中：半场胜 + 全场胜', kind: 'football', pool: 'HAFU', matchId: 3001, optionKey: 'hh', expected: 'hit' },
  { name: '足球 HAFU 未中：半场平 + 全场胜', kind: 'football', pool: 'HAFU', matchId: 3001, optionKey: 'dh', expected: 'miss' },
  { name: '足球 HAFU pending：未开奖', kind: 'football', pool: 'HAFU', matchId: 3003, optionKey: 'hh', expected: 'pending' },
  // 篮球 胜负
  { name: '篮球 MNL 命中：125-103 主胜', kind: 'basketball', pool: 'MNL', matchId: 4001, optionKey: 'h', expected: 'hit' },
  { name: '篮球 MNL 未中：125-103 主胜，选客胜', kind: 'basketball', pool: 'MNL', matchId: 4001, optionKey: 'a', expected: 'miss' },
  { name: '篮球 MNL pending：未开奖', kind: 'basketball', pool: 'MNL', matchId: 4003, optionKey: 'h', expected: 'pending' },
  // 篮球 让分
  { name: '篮球 HDC 命中：125-103 让 -5.5 主让胜', kind: 'basketball', pool: 'HDC', matchId: 4001, optionKey: 'h', goalLine: '-5.5', expected: 'hit' },
  { name: '篮球 HDC 未中：让 -5.5 主让胜，选客让胜', kind: 'basketball', pool: 'HDC', matchId: 4001, optionKey: 'a', goalLine: '-5.5', expected: 'miss' },
  { name: '篮球 HDC pending：盘口不符（腿上 -6.5，赛果 -5.5）', kind: 'basketball', pool: 'HDC', matchId: 4001, optionKey: 'h', goalLine: '-6.5', expected: 'pending' },
  // 篮球 大小分
  { name: '篮球 HILO 命中：228 分大 220.5', kind: 'basketball', pool: 'HILO', matchId: 4001, optionKey: 'h', goalLine: '220.5', expected: 'hit' },
  { name: '篮球 HILO 未中：228 分不是小分', kind: 'basketball', pool: 'HILO', matchId: 4001, optionKey: 'l', goalLine: '220.5', expected: 'miss' },
  { name: '篮球 HILO pending：盘口不符（腿上 221.5，赛果 220.5）', kind: 'basketball', pool: 'HILO', matchId: 4001, optionKey: 'h', goalLine: '221.5', expected: 'pending' },
  // 篮球 胜分差
  { name: '篮球 WNM 命中：赢 22 分归 主胜21-25', kind: 'basketball', pool: 'WNM', matchId: 4001, optionKey: 'w5', expected: 'hit' },
  { name: '篮球 WNM 未中：赢 22 分不是 客胜6-10', kind: 'basketball', pool: 'WNM', matchId: 4001, optionKey: 'l2', expected: 'miss' },
  { name: '篮球 WNM pending：未开奖', kind: 'basketball', pool: 'WNM', matchId: 4003, optionKey: 'w5', expected: 'pending' },
  // 传足 3/1/0
  { name: '传足 命中：场序 1 开 3 选 3', kind: 'traditional', pool: 'HAD', matchId: 1, optionKey: '3', expected: 'hit' },
  { name: '传足 命中：场序 2 开 1 选 1', kind: 'traditional', pool: 'HAD', matchId: 2, optionKey: '1', expected: 'hit' },
  { name: '传足 命中：场序 3 开 0 选 0', kind: 'traditional', pool: 'HAD', matchId: 3, optionKey: '0', expected: 'hit' },
  { name: '传足 未中：场序 1 开 3 选 1', kind: 'traditional', pool: 'HAD', matchId: 1, optionKey: '1', expected: 'miss' },
  { name: '传足 未中：场序 3 开 0 选 3', kind: 'traditional', pool: 'HAD', matchId: 3, optionKey: '3', expected: 'miss' },
  { name: '传足 pending：场序超出 14 场', kind: 'traditional', pool: 'HAD', matchId: 15, optionKey: '3', expected: 'pending' },
]

describe('适配层：SportMatchResult → plan-result 的 MatchResults', () => {
  test('足球五个玩法都从映射后的赛果还原出来', () => {
    const entry = RESULTS.football['3001']
    expect(entry.pools.HAD).toEqual({ '': ['h'] })
    expect(entry.pools.HHAD).toEqual({ '-1': ['d'] })
    expect(entry.pools.CRS).toEqual({ '': ['s02s01'] })
    expect(entry.pools.TTG).toEqual({ '': ['s3'] })
    expect(entry.pools.HAFU).toEqual({ '': ['hh'] })
  })

  test('篮球四个玩法都从映射后的赛果还原出来（含 matchResultList 里的盘口）', () => {
    const first = RESULTS.basketball['4001']
    expect(first.pools.MNL).toEqual({ '': ['h'] })
    expect(first.pools.WNM).toEqual({ '': ['w5'] })
    expect(first.pools.HDC).toEqual({ '-5.5': ['h'] })
    expect(first.pools.HILO).toEqual({ '220.5': ['h'] })

    const second = RESULTS.basketball['4002']
    expect(second.pools.MNL).toEqual({ '': ['a'] })
    expect(second.pools.HDC).toEqual({ '3.5': ['a'] })
    expect(second.pools.HILO).toEqual({ '210.5': ['l'] })
  })

  test('未开奖的场次只有空盘口表，不会凭空造出赛果', () => {
    expect(RESULTS.football['3003'].pools).toEqual({})
    expect(RESULTS.basketball['4003'].pools).toEqual({})
  })

  test('传足只认开奖日等于当天的期次', () => {
    expect(Object.keys(traditionalResults(TRADITIONAL_DRAWS, TRADITIONAL_DATE))).toHaveLength(14)
    expect(traditionalResults(TRADITIONAL_DRAWS, '2026-11-21')).toEqual({})
    expect(traditionalResults([], TRADITIONAL_DATE)).toEqual({})
  })

  test('结果日期与腿日期不同天时判 pending，不判 miss', () => {
    const leg = makeLeg({ matchDate: '2026-11-22 20:00' })
    expect(legResult(leg, 'football')).toBe('pending')
  })
})

describe('AC-2：各玩法判定矩阵', () => {
  test.each(CASES)('$name', (item) => {
    const leg = makeLeg({
      sport: item.kind === 'basketball' ? 'basketball' : 'football',
      poolCode: item.pool,
      matchId: item.matchId,
      optionKey: item.optionKey,
      goalLine: item.goalLine ?? '',
      matchDate:
        item.matchDate ?? dateTime(item.kind === 'traditional' ? TRADITIONAL_DATE : FOOTBALL_DATE),
    })
    expect(legResult(leg, item.kind)).toBe(item.expected)
  })

  test('每个玩法都有命中 / 未中 / pending 三类用例', () => {
    const pools: Array<PoolCode | 'TRADITIONAL'> = [
      'HAD',
      'HHAD',
      'CRS',
      'TTG',
      'HAFU',
      'MNL',
      'HDC',
      'HILO',
      'WNM',
      'TRADITIONAL',
    ]
    const missing = pools
      .map((pool) => {
        const statuses =
          pool === 'TRADITIONAL'
            ? CASES.filter((item) => item.kind === 'traditional').map((item) => item.expected)
            : CASES.filter((item) => item.kind !== 'traditional' && item.pool === pool).map((item) => item.expected)
        return { pool, statuses }
      })
      .filter((row) => !(['hit', 'miss', 'pending'] as JudgeValue[]).every((value) => row.statuses.includes(value)))
      .map((row) => row.pool)
    expect(missing).toEqual([])
  })
})

describe('整单判中（AC-37 复式同场任一腿命中即该场命中）', () => {
  test('同场两腿一中一未，整单仍算命中', () => {
    const legs = [
      makeLeg({ optionKey: 'h' }),
      makeLeg({ optionKey: 'a' }),
      makeLeg({ matchId: 4001, sport: 'basketball', poolCode: 'MNL', optionKey: 'h' }),
    ]
    const results = { ...RESULTS.football, ...RESULTS.basketball }
    expect(judgePlan(judgeLegs(legs, results))).toBe('hit')
  })

  test('任一场未中就是未中', () => {
    const legs = [makeLeg({ optionKey: 'h' }), makeLeg({ matchId: 3002, optionKey: 'h' })]
    expect(judgePlan(judgeLegs(legs, RESULTS.football))).toBe('miss')
  })

  test('还有未开奖的场次就是 pending', () => {
    const legs = [makeLeg({ optionKey: 'h' }), makeLeg({ matchId: 3003, optionKey: 'h' })]
    expect(judgePlan(judgeLegs(legs, RESULTS.football))).toBe('pending')
  })
})

describe('judgePlans：落盘规则', () => {
  test('命中写回 judged=hit，pending 不落盘', async () => {
    saveDay(makeDay({ date: FOOTBALL_DATE, legs: [makeLeg({})] }))
    saveDay(
      makeDay({
        date: '2026-11-24',
        legs: [makeLeg({ matchId: 3003, matchDate: dateTime('2026-11-24') })],
      }),
    )

    const out = await judgePlans(
      [makeDay({ date: FOOTBALL_DATE }), makeDay({ date: '2026-11-24', legs: [makeLeg({ matchId: 3003, matchDate: dateTime('2026-11-24') })] })],
      makeSources(),
    )

    expect(out).toEqual([
      { date: FOOTBALL_DATE, judged: 'hit' },
      { date: '2026-11-24', judged: 'pending' },
    ])
    expect(findDay(FOOTBALL_DATE)?.judged).toBe('hit')
    expect(findDay('2026-11-24')?.judged).toBeUndefined()
  })

  test('未中同样落盘', async () => {
    saveDay(makeDay({ date: FOOTBALL_DATE, legs: [makeLeg({ optionKey: 'a' })] }))
    await judgePlans([makeDay({ date: FOOTBALL_DATE, legs: [makeLeg({ optionKey: 'a' })] })], makeSources())
    expect(findDay(FOOTBALL_DATE)?.judged).toBe('miss')
  })

  test('幂等：第二次调用不再取数也不再写盘', async () => {
    const day = makeDay({ date: FOOTBALL_DATE, legs: [makeLeg({})] })
    saveDay(day)
    taro.setStorageSync.mockClear()
    await judgePlans([day], makeSources())
    expect(taro.setStorageSync).toHaveBeenCalledTimes(1)

    taro.setStorageSync.mockClear()
    const football = jest.fn(async () => FOOTBALL_RESULTS)
    const again = await judgePlans([findDay(FOOTBALL_DATE) as StoredPlanDay], makeSources({ football }))

    expect(again).toEqual([{ date: FOOTBALL_DATE, judged: 'hit' }])
    expect(football).not.toHaveBeenCalled()
    expect(taro.setStorageSync).not.toHaveBeenCalled()
  })

  test('终态不被 pending 覆盖：赛果没回来也留最后的判中结果', async () => {
    saveDay(makeDay({ date: FOOTBALL_DATE, judged: 'miss' }))
    const out = await judgePlans([findDay(FOOTBALL_DATE) as StoredPlanDay], makeSources({ football: async () => null }))
    expect(out).toEqual([{ date: FOOTBALL_DATE, judged: 'miss' }])
    expect(findDay(FOOTBALL_DATE)?.judged).toBe('miss')
  })

  test('值没变化不留多余的写盘', async () => {
    saveDay(makeDay({ date: FOOTBALL_DATE, judged: undefined }))
    const day = findDay(FOOTBALL_DATE) as StoredPlanDay
    taro.setStorageSync.mockClear()
    const out = await judgePlans([day], makeSources({ football: async () => null }))
    expect(out).toEqual([{ date: FOOTBALL_DATE, judged: 'pending' }])
    expect(taro.setStorageSync).not.toHaveBeenCalled()
  })

  test('写回时重读记录，保留判定期间用户改过的 note', async () => {
    saveDay(makeDay({ date: FOOTBALL_DATE, legs: [makeLeg({})] }))
    const sources = makeSources({
      football: async (date: string) => {
        const current = findDay(date) as StoredPlanDay
        saveDay({ ...current, note: '临场加注', updatedAt: Date.now() })
        return FOOTBALL_RESULTS
      },
    })

    await judgePlans([findDay(FOOTBALL_DATE) as StoredPlanDay], sources)

    expect(findDay(FOOTBALL_DATE)?.judged).toBe('hit')
    expect(findDay(FOOTBALL_DATE)?.note).toBe('临场加注')
  })

  test('取数抛错退化为 pending，不向上抛', async () => {
    const out = await judgePlans(
      [makeDay({ date: FOOTBALL_DATE })],
      makeSources({
        football: async () => {
          throw new Error('断网')
        },
      }),
    )
    expect(out).toEqual([{ date: FOOTBALL_DATE, judged: 'pending' }])
  })

  test('没有 legs 的天不参与判定', async () => {
    const football = jest.fn(async () => FOOTBALL_RESULTS)
    const out = await judgePlans([makeDay({ date: FOOTBALL_DATE, legs: [] })], makeSources({ football }))
    expect(out).toEqual([])
    expect(football).not.toHaveBeenCalled()
  })

  test('传足按 3/1/0 走传足取数，不碰竞彩取数', async () => {
    const date = TRADITIONAL_DATE
    const legs = [
      makeLeg({ matchId: 1, optionKey: '3', matchDate: dateTime(date) }),
      makeLeg({ matchId: 2, optionKey: '1', matchDate: dateTime(date) }),
      makeLeg({ matchId: 3, optionKey: '0', matchDate: dateTime(date) }),
    ]
    saveDay(makeDay({ date, legs }))

    const football = jest.fn(async () => FOOTBALL_RESULTS)
    const out = await judgePlans([findDay(date) as StoredPlanDay], makeSources({ football }))

    expect(out).toEqual([{ date, judged: 'hit' }])
    expect(football).not.toHaveBeenCalled()
    expect(findDay(date)?.judged).toBe('hit')
  })

  test('传足当天没有开奖期次时判 pending', async () => {
    const date = '2026-11-24'
    const legs = [makeLeg({ matchId: 1, optionKey: '3', matchDate: dateTime(date) })]
    const out = await judgePlans([makeDay({ date, legs })], makeSources())
    expect(out).toEqual([{ date, judged: 'pending' }])
  })

  test('篮球按 basketball 取数', async () => {
    const legs = [makeLeg({ sport: 'basketball', matchId: 4001, poolCode: 'MNL', optionKey: 'h' })]
    const football = jest.fn(async () => FOOTBALL_RESULTS)
    const basketball = jest.fn(async () => BASKETBALL_RESULTS)
    saveDay(makeDay({ date: FOOTBALL_DATE, sport: 'basketball', legs }))

    const out = await judgePlans([findDay(FOOTBALL_DATE) as StoredPlanDay], makeSources({ football, basketball }))

    expect(out).toEqual([{ date: FOOTBALL_DATE, judged: 'hit' }])
    expect(basketball).toHaveBeenCalledWith(FOOTBALL_DATE)
    expect(football).not.toHaveBeenCalled()
  })
})

describe('judgeRecentPlans：窗口与入口', () => {
  test('窗口是近 7 天', () => {
    expect(JUDGE_WINDOW_DAYS).toBe(7)
  })

  test('只判定近 7 天且有 legs 的天', async () => {
    saveDay(makeDay({ date: '2026-11-25', legs: [makeLeg({ matchDate: dateTime('2026-11-25') })] }))
    saveDay(makeDay({ date: FOOTBALL_DATE, legs: [makeLeg({})] }))
    saveDay(makeDay({ date: '2026-11-24', legs: [], rest: true }))
    saveDay(makeDay({ date: '2026-11-18', legs: [makeLeg({ matchDate: dateTime('2026-11-18') })] }))

    const footballDates: string[] = []
    const football = jest.fn(async (dateKey: string) => {
      footballDates.push(dateKey)
      return FOOTBALL_RESULTS
    })
    const out = await judgeRecentPlans(7, '2026-11-25', makeSources({ football }))

    expect(footballDates.sort()).toEqual(['2026-11-23', '2026-11-25'])
    expect(out.map((item) => item.date).sort()).toEqual(['2026-11-23', '2026-11-25'])
    // 赛果按「取数日」标注，窗口内的两天都能判中
    expect(out.find((item) => item.date === FOOTBALL_DATE)?.judged).toBe('hit')
    expect(out.find((item) => item.date === '2026-11-25')?.judged).toBe('hit')
    expect(findDay('2026-11-18')?.judged).toBeUndefined()
  })

  test('取数整体失败时静默返回 pending，不抛错', async () => {
    saveDay(makeDay({ date: FOOTBALL_DATE, legs: [makeLeg({})] }))
    const out = await judgeRecentPlans(
      7,
      '2026-11-25',
      makeSources({
        football: async () => {
          throw new Error('断网')
        },
      }),
    )
    expect(out).toEqual([{ date: FOOTBALL_DATE, judged: 'pending' }])
  })

  test('第二次进入页面结果不变（可重入）', async () => {
    saveDay(makeDay({ date: FOOTBALL_DATE, legs: [makeLeg({})] }))
    const first = await judgeRecentPlans(7, '2026-11-25', makeSources())
    const second = await judgeRecentPlans(7, '2026-11-25', makeSources())
    expect(second).toEqual(first)
    expect(findDay(FOOTBALL_DATE)?.judged).toBe('hit')
  })
})

// ============ AC-11 / AC-15：方案之间的记录与判定互不覆盖 ============

describe('按方案隔离（AC-11 / AC-15）', () => {
  test('两个方案同名日期各自判中，互不覆盖', async () => {
    saveDay(makeDay({ planId: 'plan-a', date: FOOTBALL_DATE, legs: [makeLeg({ optionKey: 'h' })] }))
    saveDay(makeDay({ planId: 'plan-b', date: FOOTBALL_DATE, legs: [makeLeg({ optionKey: 'a' })] }))

    const out = await judgeRecentPlans(7, '2026-11-25', makeSources())

    // 两个方案各有一条同名日期的记录，各自落自己的 judged
    expect(out).toHaveLength(2)
    expect(out.every((item) => item.date === FOOTBALL_DATE)).toBe(true)
    expect(findDay(FOOTBALL_DATE, 'plan-a')?.judged).toBe('hit')
    expect(findDay(FOOTBALL_DATE, 'plan-b')?.judged).toBe('miss')
  })

  test('listDays(planA) 只含本方案记录，同名日期的 planB 记录不串方案', () => {
    saveDay(makeDay({ planId: 'plan-a', date: FOOTBALL_DATE }))
    saveDay(makeDay({ planId: 'plan-b', date: FOOTBALL_DATE }))
    saveDay(makeDay({ planId: 'plan-b', date: TRADITIONAL_DATE }))

    expect(listDays('plan-a').map((day) => day.date)).toEqual([FOOTBALL_DATE])
    expect(listDays('plan-a').every((day) => day.planId === 'plan-a')).toBe(true)
    // date 倒序：plan-b 自己那两天，plan-a 的记录不进来
    expect(listDays('plan-b').map((day) => day.date)).toEqual([FOOTBALL_DATE, TRADITIONAL_DATE])
  })
})
