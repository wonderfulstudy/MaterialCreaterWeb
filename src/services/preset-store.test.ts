import Taro from '@tarojs/taro'
import { configureCore } from '@mc/core/platform'
import type { KeyValueStore } from '@mc/core/platform/storage'
import { summarizeLegs } from '@/components/PlanCalculator/calc'
import type { PlanLeg } from '@/components/PlanCalculator/model'
import { taroFeedback } from '@/platform/taro-feedback'
import { taroTransport } from '@/platform/taro-transport'
import {
  PRESET_STORE_KEY,
  findPreset,
  listPresets,
  loadStore,
  parseStore,
  savePreset,
  type StoredPreset,
} from './preset-store'

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
    matchId: 3,
    matchNumStr: '周一003',
    league: '西甲',
    matchDate: '2026-11-25',
    homeTeam: '主队3',
    awayTeam: '客队3',
    poolCode: 'HAD',
    poolName: '胜平负',
    goalLine: '',
    optionKey: 'a',
    optionLabel: '负',
    odds: 4.5,
  },
  {
    sport: 'football',
    matchId: 2,
    matchNumStr: '周一002',
    league: '意甲',
    matchDate: '2026-11-25',
    homeTeam: '主队2',
    awayTeam: '客队2',
    poolCode: 'HAD',
    poolName: '胜平负',
    goalLine: '',
    optionKey: 'd',
    optionLabel: '平',
    odds: 3.3,
  },
]

function preset(overrides: Partial<StoredPreset> = {}): StoredPreset {
  return {
    id: 'max',
    name: '最高赔率预设',
    sport: 'football',
    passSizes: [2],
    passLabel: '2串1',
    multiple: 2,
    legs: LEGS,
    summary: summarizeLegs(LEGS, [2], 2),
    candidateIndex: 1,
    candidateCount: 3,
    date: '2026-11-25',
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

describe('preset-store', () => {
  it('savePreset 写固定 key，findPreset 原样读回', () => {
    savePreset(preset())

    expect(PRESET_STORE_KEY).toBe('mc.presets.v1')
    expect(storage.has(PRESET_STORE_KEY)).toBe(true)
    expect(findPreset('max')).toEqual(preset())
    expect(findPreset('min')).toBeNull()
  })

  it('两个系列各自保存，listPresets 按 id 稳定排序', () => {
    savePreset(preset({ id: 'min', name: '最低赔率预设' }))
    savePreset(preset())

    expect(listPresets().map((item) => item.id)).toEqual(['max', 'min'])
    expect(findPreset('min')?.name).toBe('最低赔率预设')
  })

  it('storage 为空时回落空快照', () => {
    expect(loadStore()).toEqual({ version: 1, presets: {} })
    expect(listPresets()).toEqual([])
  })

  it('坏 JSON / 版本不符 / 结构不符回落空快照且不抛', () => {
    storage.set(PRESET_STORE_KEY, '{"version":1,"presets":')
    expect(loadStore()).toEqual({ version: 1, presets: {} })

    storage.set(PRESET_STORE_KEY, { version: 2, presets: {} })
    expect(loadStore()).toEqual({ version: 1, presets: {} })

    storage.set(PRESET_STORE_KEY, { version: 1, presets: [] })
    expect(loadStore()).toEqual({ version: 1, presets: {} })

    expect(parseStore(null)).toEqual({ version: 1, presets: {} })
    expect(parseStore('')).toEqual({ version: 1, presets: {} })
  })

  it('单条预设字段不合法时被丢弃，其余保留', () => {
    storage.set(PRESET_STORE_KEY, {
      version: 1,
      presets: {
        max: preset(),
        badSizes: preset({ id: 'badSizes', passSizes: [] }),
        badMultiple: preset({ id: 'badMultiple', multiple: 0 }),
        badIndex: preset({ id: 'badIndex', candidateIndex: 4, candidateCount: 3 }),
        badDate: preset({ id: 'badDate', date: '11-25' }),
        badSport: preset({ id: 'badSport', sport: 'tennis' as StoredPreset['sport'] }),
      },
    })

    expect(Object.keys(loadStore().presets)).toEqual(['max'])
  })

  it('storage 抛错时读取回落空、写入不抛出', () => {
    taro.getStorageSync.mockImplementationOnce(() => {
      throw new Error('storage unavailable')
    })
    expect(loadStore()).toEqual({ version: 1, presets: {} })

    taro.setStorageSync.mockImplementationOnce(() => {
      throw new Error('quota exceeded')
    })
    expect(savePreset(preset()).presets.max.date).toBe('2026-11-25')
  })

  it('存储里是 JSON 字符串时同样能读回', () => {
    storage.set(PRESET_STORE_KEY, JSON.stringify({ version: 1, presets: { max: preset() } }))

    expect(findPreset('max')).toEqual(preset())
  })
})
