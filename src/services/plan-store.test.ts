import Taro from '@tarojs/taro'
import { configureCore } from '@mc/core/platform'
import type { KeyValueStore } from '@mc/core/platform/storage'
import { summarizeLegs } from '@/components/PlanCalculator/calc'
import type { PlanLeg } from '@/components/PlanCalculator/model'
import { taroFeedback } from '@/platform/taro-feedback'
import { taroTransport } from '@/platform/taro-transport'
import {
  LEGACY_PLAN_ID,
  PLAN_STORE_KEY,
  findDay,
  findPlan,
  listDays,
  listDaysMap,
  listPlans,
  loadStore,
  markRest,
  planStats,
  primaryPlanId,
  removePlans,
  saveDay,
  savePlan,
  type StoredPlan,
  type StoredPlanDay,
} from './plan-store'

jest.mock('@tarojs/taro', () => ({
  __esModule: true,
  default: {
    getStorageSync: jest.fn(),
    setStorageSync: jest.fn(),
  },
}))

interface TaroMock {
  getStorageSync: jest.Mock
  setStorageSync: jest.Mock
}

const taro = Taro as unknown as TaroMock
const storage = new Map<string, unknown>()

/** 实现已迁到 @mc/core：把平台存储接回本文件 mock 的 Taro（core 以 JSON 字符串落盘） */
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

const LEGS: PlanLeg[] = [
  {
    sport: 'football',
    matchId: 1,
    matchNumStr: '2001',
    league: '英超',
    matchDate: '2026-11-25',
    homeTeam: '主队1',
    awayTeam: '客队1',
    poolCode: 'HAD',
    poolName: '胜平负',
    goalLine: '',
    optionKey: 'h',
    optionLabel: '胜',
    odds: 1.5,
  },
  {
    sport: 'football',
    matchId: 2,
    matchNumStr: '2002',
    league: '意甲',
    matchDate: '2026-11-25',
    homeTeam: '主队2',
    awayTeam: '客队2',
    poolCode: 'HAD',
    poolName: '胜平负',
    goalLine: '',
    optionKey: 'a',
    optionLabel: '负',
    odds: 2.4,
  },
  {
    sport: 'football',
    matchId: 3,
    matchNumStr: '2003',
    league: '西甲',
    matchDate: '2026-11-25',
    homeTeam: '主队3',
    awayTeam: '客队3',
    poolCode: 'HAD',
    poolName: '胜平负',
    goalLine: '',
    optionKey: 'd',
    optionLabel: '平',
    odds: 3.1,
  },
]

const PLAN_ID = 'plan-a'

function plan(id = PLAN_ID, overrides: Partial<StoredPlan> = {}): StoredPlan {
  return {
    id,
    name: '方案 1',
    sport: 'football',
    legs: LEGS,
    passIds: ['p3x4'],
    multiple: 2,
    createdAt: 1735689600000,
    updatedAt: 1735689600000,
    ...overrides,
  }
}

function day(date: string, overrides: Partial<StoredPlanDay> = {}): StoredPlanDay {
  return {
    planId: PLAN_ID,
    date,
    sport: 'football',
    multiple: 2,
    passIds: ['p3x4'],
    legs: LEGS,
    summary: summarizeLegs(LEGS, [2, 3], 2),
    rest: false,
    updatedAt: 1735689600000,
    ...overrides,
  }
}

beforeEach(() => {
  storage.clear()
  taro.getStorageSync.mockImplementation((key: string) => (storage.has(key) ? storage.get(key) : ''))
  taro.setStorageSync.mockImplementation((key: string, value: unknown) => {
    storage.set(key, value)
  })
})

function primePlan(id = PLAN_ID): void {
  savePlan(plan(id))
}

describe('plan-store', () => {
  it('saveDay 写入固定 key，findDay 原样读回（含 updatedAt 以入参为准）', () => {
    primePlan()
    const entry = day('2026-11-25', { updatedAt: 1720000000000 })
    saveDay(entry)

    expect(storage.has(PLAN_STORE_KEY)).toBe(true)
    expect(PLAN_STORE_KEY).toBe('mc.plans.v1')
    expect(findDay('2026-11-25', PLAN_ID)).toEqual(entry)
    expect(findDay('2026-11-25', PLAN_ID)?.updatedAt).toBe(1720000000000)
    expect(findDay('2026-11-01', PLAN_ID)).toBeNull()
  })

  it('saveDay 覆盖同一 date，其余日期保留', () => {
    primePlan()
    saveDay(day('2026-11-25'))
    saveDay(day('2026-11-24'))
    saveDay(day('2026-11-25', { multiple: 10, passIds: ['p4x11'] }))

    expect(listDays(PLAN_ID)).toHaveLength(2)
    expect(findDay('2026-11-25', PLAN_ID)).toEqual(day('2026-11-25', { multiple: 10, passIds: ['p4x11'] }))
  })

  it('listDays 按日期倒序排列', () => {
    primePlan()
    saveDay(day('2026-11-23'))
    saveDay(day('2026-11-25'))
    saveDay(day('2026-11-24'))

    expect(listDays(PLAN_ID).map((item) => item.date)).toEqual(['2026-11-25', '2026-11-24', '2026-11-23'])
  })

  it('两个方案的记录互不可见（AC-11 / AC-15）', () => {
    savePlan(plan('plan-a'))
    savePlan(plan('plan-b', { name: '方案 2', createdAt: 1735689601000 }))
    saveDay(day('2026-11-25', { planId: 'plan-a' }))
    saveDay(day('2026-11-25', { planId: 'plan-b', multiple: 5 }))
    saveDay(day('2026-11-24', { planId: 'plan-b' }))

    expect(listDays('plan-a').map((item) => item.date)).toEqual(['2026-11-25'])
    expect(listDays('plan-b').map((item) => item.date)).toEqual(['2026-11-25', '2026-11-24'])
    expect(findDay('2026-11-25', 'plan-b')?.multiple).toBe(5)
    expect(listDays()).toHaveLength(3)
    expect(listDaysMap('plan-b')).toHaveProperty('2026-11-24')
  })

  it('savePlan 覆盖同一 id，listPlans 按创建时间正序', () => {
    savePlan(plan('plan-b', { createdAt: 1735689602000 }))
    savePlan(plan('plan-a', { createdAt: 1735689601000 }))
    savePlan(plan('plan-a', { name: '改名了' }))

    expect(listPlans().map((item) => item.id)).toEqual(['plan-a', 'plan-b'])
    expect(findPlan('plan-a')?.name).toBe('改名了')
    expect(primaryPlanId()).toBe('plan-a')
  })

  it('removePlans 连记录一起删掉', () => {
    savePlan(plan('plan-a'))
    savePlan(plan('plan-b', { createdAt: 1735689602000 }))
    saveDay(day('2026-11-25', { planId: 'plan-a' }))
    saveDay(day('2026-11-25', { planId: 'plan-b' }))

    removePlans(['plan-a'])

    expect(listPlans().map((item) => item.id)).toEqual(['plan-b'])
    expect(findDay('2026-11-25', 'plan-a')).toBeNull()
    expect(findDay('2026-11-25', 'plan-b')).not.toBeNull()
    expect(primaryPlanId()).toBe('plan-b')
  })

  it('planStats 统计期数并跳过休息日算连中', () => {
    primePlan()
    saveDay(day('2026-11-20', { judged: 'hit' }))
    saveDay(day('2026-11-21', { judged: 'hit' }))
    saveDay(day('2026-11-22', { rest: true, judged: 'hit' }))
    saveDay(day('2026-11-23', { judged: 'hit' }))
    saveDay(day('2026-11-24', { judged: 'miss' }))
    saveDay(day('2026-11-25', { judged: 'pending' }))

    const stats = planStats(PLAN_ID)
    expect(stats.total).toBe(5)
    expect(stats.hit).toBe(3)
    expect(stats.miss).toBe(1)
    expect(stats.pending).toBe(1)
    expect(stats.streak).toBe(0)
    expect(stats.last?.date).toBe('2026-11-25')

    saveDay(day('2026-11-24', { judged: 'hit' }))
    saveDay(day('2026-11-25', { judged: 'hit' }))
    // 11-20/21/23/24/25 全命中，11-22 休息跳过不打断 → 5
    expect(planStats(PLAN_ID).streak).toBe(5)
  })

  it('markRest 置位与取消 rest，其它字段不变', () => {
    primePlan()
    saveDay(day('2026-11-25'))

    markRest('2026-11-25', true, PLAN_ID)
    expect(findDay('2026-11-25', PLAN_ID)?.rest).toBe(true)
    expect(findDay('2026-11-25', PLAN_ID)?.legs).toEqual(LEGS)
    expect(findDay('2026-11-25', PLAN_ID)?.summary).toEqual(day('2026-11-25').summary)

    markRest('2026-11-25', false, PLAN_ID)
    expect(findDay('2026-11-25', PLAN_ID)?.rest).toBe(false)
  })

  it('markRest 对没有方案的日期是无操作', () => {
    primePlan()
    saveDay(day('2026-11-25'))
    markRest('2026-11-20', true, PLAN_ID)

    expect(Object.keys(listDaysMap(PLAN_ID))).toEqual(['2026-11-25'])
    expect(findDay('2026-11-20', PLAN_ID)).toBeNull()
  })

  it('storage 为空时回落空快照', () => {
    expect(loadStore()).toEqual({ version: 2, plans: {}, days: {} })
    expect(listDays()).toEqual([])
    expect(listPlans()).toEqual([])
    expect(primaryPlanId()).toBeNull()
    expect(findDay('2026-11-25')).toBeNull()
  })

  it('坏 JSON / 结构不符 / 版本不符一律回落空快照且不抛', () => {
    storage.set(PLAN_STORE_KEY, '{"version":2,"plans":')
    expect(loadStore()).toEqual({ version: 2, plans: {}, days: {} })

    storage.set(PLAN_STORE_KEY, { version: 3, plans: {}, days: {} })
    expect(loadStore()).toEqual({ version: 2, plans: {}, days: {} })

    storage.set(PLAN_STORE_KEY, { version: 2, plans: [], days: [] })
    expect(loadStore()).toEqual({ version: 2, plans: {}, days: {} })

    storage.set(PLAN_STORE_KEY, { version: 2, plans: {}, days: { 'plan-a': { '2026-11-25': { date: '2026-11-25' } } } })
    expect(listDays()).toEqual([])
  })

  it('v1 单方案快照迁移成「方案 1」，历史记录全部归到它名下', () => {
    storage.set(
      PLAN_STORE_KEY,
      JSON.stringify({
        version: 1,
        days: {
          '2026-11-24': { ...day('2026-11-24'), planId: undefined },
          '2026-11-25': { ...day('2026-11-25'), planId: undefined },
        },
      }),
    )

    const store = loadStore()
    expect(store.version).toBe(2)
    expect(listPlans()).toHaveLength(1)
    expect(primaryPlanId()).toBe(LEGACY_PLAN_ID)
    expect(findPlan(LEGACY_PLAN_ID)?.name).toBe('方案 1')
    expect(listDays(LEGACY_PLAN_ID).map((item) => item.date)).toEqual(['2026-11-25', '2026-11-24'])
    expect(findDay('2026-11-25')?.planId).toBe(LEGACY_PLAN_ID)
  })

  it('storage 抛错时读取回落空快照、写入不抛出', () => {
    taro.getStorageSync.mockImplementationOnce(() => {
      throw new Error('storage unavailable')
    })
    expect(loadStore()).toEqual({ version: 2, plans: {}, days: {} })

    primePlan()
    taro.setStorageSync.mockImplementationOnce(() => {
      throw new Error('quota exceeded')
    })
    expect(saveDay(day('2026-11-25')).days[PLAN_ID]['2026-11-25'].date).toBe('2026-11-25')
  })

  it('存储里是 JSON 字符串时同样能读回（兼容宿主序列化）', () => {
    storage.set(
      PLAN_STORE_KEY,
      JSON.stringify({ version: 2, plans: { [PLAN_ID]: plan() }, days: { [PLAN_ID]: { '2026-11-25': day('2026-11-25') } } }),
    )

    expect(findDay('2026-11-25', PLAN_ID)).toEqual(day('2026-11-25'))
  })
})
