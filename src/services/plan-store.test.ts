import Taro from '@tarojs/taro'
import { summarizeLegs } from '@/components/PlanCalculator/calc'
import type { PlanLeg } from '@/components/PlanCalculator/model'
import { PLAN_STORE_KEY, findDay, listDays, loadStore, markRest, saveDay, type StoredPlanDay } from './plan-store'

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

function day(date: string, overrides: Partial<StoredPlanDay> = {}): StoredPlanDay {
  return {
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

describe('plan-store', () => {
  it('saveDay 写入固定 key，findDay 原样读回（含 updatedAt 以入参为准）', () => {
    const entry = day('2026-11-25', { updatedAt: 1720000000000 })
    saveDay(entry)

    expect(storage.has(PLAN_STORE_KEY)).toBe(true)
    expect(PLAN_STORE_KEY).toBe('mc.plans.v1')
    expect(findDay('2026-11-25')).toEqual(entry)
    expect(findDay('2026-11-25')?.updatedAt).toBe(1720000000000)
    expect(findDay('2026-11-01')).toBeNull()
  })

  it('saveDay 覆盖同一 date，其余日期保留', () => {
    saveDay(day('2026-11-25'))
    saveDay(day('2026-11-24'))
    saveDay(day('2026-11-25', { multiple: 10, passIds: ['p4x11'] }))

    expect(listDays()).toHaveLength(2)
    expect(findDay('2026-11-25')).toEqual(day('2026-11-25', { multiple: 10, passIds: ['p4x11'] }))
  })

  it('listDays 按日期倒序排列', () => {
    saveDay(day('2026-11-23'))
    saveDay(day('2026-11-25'))
    saveDay(day('2026-11-24'))

    expect(listDays().map((item) => item.date)).toEqual(['2026-11-25', '2026-11-24', '2026-11-23'])
  })

  it('markRest 置位与取消 rest，其它字段不变', () => {
    saveDay(day('2026-11-25'))

    const rested = markRest('2026-11-25')
    expect(rested.days['2026-11-25'].rest).toBe(true)
    expect(findDay('2026-11-25')?.legs).toEqual(LEGS)
    expect(findDay('2026-11-25')?.summary).toEqual(day('2026-11-25').summary)

    markRest('2026-11-25', false)
    expect(findDay('2026-11-25')?.rest).toBe(false)
  })

  it('markRest 对没有方案的日期是无操作', () => {
    saveDay(day('2026-11-25'))
    const snapshot = markRest('2026-11-20')

    expect(Object.keys(snapshot.days)).toEqual(['2026-11-25'])
    expect(findDay('2026-11-20')).toBeNull()
  })

  it('storage 为空时回落空快照', () => {
    expect(loadStore()).toEqual({ version: 1, days: {} })
    expect(listDays()).toEqual([])
  })

  it('坏 JSON / 结构不符 / 版本不符一律回落空快照且不抛', () => {
    storage.set(PLAN_STORE_KEY, '{"version":1,"days":')
    expect(loadStore()).toEqual({ version: 1, days: {} })

    storage.set(PLAN_STORE_KEY, { version: 2, days: {} })
    expect(loadStore()).toEqual({ version: 1, days: {} })

    storage.set(PLAN_STORE_KEY, { version: 1, days: [] })
    expect(loadStore()).toEqual({ version: 1, days: {} })

    storage.set(PLAN_STORE_KEY, { version: 1, days: { '2026-11-25': { date: '2026-11-25' } } })
    expect(loadStore()).toEqual({ version: 1, days: {} })
  })

  it('storage 抛错时读取回落空快照、写入不抛出', () => {
    taro.getStorageSync.mockImplementationOnce(() => {
      throw new Error('storage unavailable')
    })
    expect(loadStore()).toEqual({ version: 1, days: {} })

    taro.setStorageSync.mockImplementationOnce(() => {
      throw new Error('quota exceeded')
    })
    expect(saveDay(day('2026-11-25')).days['2026-11-25'].date).toBe('2026-11-25')
  })

  it('存储里是 JSON 字符串时同样能读回（兼容宿主序列化）', () => {
    storage.set(PLAN_STORE_KEY, JSON.stringify({ version: 1, days: { '2026-11-25': day('2026-11-25') } }))

    expect(findDay('2026-11-25')).toEqual(day('2026-11-25'))
  })
})
