import Taro from '@tarojs/taro'
import {
  MATRIX_SETTINGS_KEY,
  MATRIX_STORE_KEY,
  findMatrix,
  loadMatrixSettings,
  loadMatrixStore,
  saveMatrix,
  saveMatrixSettings,
} from './matrix-store'
import { defaultMatrixSettings, type MatrixSnapshot } from '@/pages/matrix/matrix-data'

jest.mock('@tarojs/taro', () => ({
  __esModule: true,
  default: {
    getStorageSync: jest.fn(),
    setStorageSync: jest.fn(),
  },
}))

const getStorageSync = Taro.getStorageSync as jest.Mock
const setStorageSync = Taro.setStorageSync as jest.Mock

let storage: Map<string, string>

/** 复式一格两个结果，用于验证读回顺序稳定 */
function multiSnapshot(overrides: Partial<MatrixSnapshot> = {}): MatrixSnapshot {
  return {
    version: 1,
    date: '2026-11-25',
    sport: 'football',
    updatedAt: 1735689600000,
    rows: [
      {
        matchId: 1001,
        matchNo: '001',
        league: '欧冠',
        home: '曼城',
        away: '皇马',
        time: '03:45',
        cells: [
          {
            poolCode: 'HAD',
            line: '',
            options: [
              { optionKey: 'h', label: '胜', odds: 2.15 },
              { optionKey: 'd', label: '平', odds: 3.4 },
            ],
          },
          { poolCode: 'HHAD', line: '-1', options: [{ optionKey: 'a', label: '让负', odds: 2.82 }] },
        ],
      },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  storage = new Map<string, string>()
  jest.clearAllMocks()
  getStorageSync.mockImplementation((key: string) => (storage.has(key) ? storage.get(key) : ''))
  setStorageSync.mockImplementation((key: string, value: string) => {
    storage.set(key, value)
  })
})

describe('matrix-store 快照落盘', () => {
  it('保存后写入 mc.matrix.v1，并能按 sport + date 读回复式选中的赔率与盘口线', () => {
    saveMatrix(multiSnapshot())

    expect(setStorageSync).toHaveBeenCalledWith(MATRIX_STORE_KEY, expect.any(Object))
    const found = findMatrix('football', '2026-11-25')
    expect(found?.rows[0].matchNo).toBe('001')
    expect(found?.rows[0].cells).toEqual([
      {
        poolCode: 'HAD',
        line: '',
        options: [
          { optionKey: 'h', label: '胜', odds: 2.15 },
          { optionKey: 'd', label: '平', odds: 3.4 },
        ],
      },
      { poolCode: 'HHAD', line: '-1', options: [{ optionKey: 'a', label: '让负', odds: 2.82 }] },
    ])
    expect(found?.updatedAt).toBe(1735689600000)
  })

  it('同一天重复保存覆盖，不同日期 / 不同运动互不影响', () => {
    saveMatrix(multiSnapshot())
    saveMatrix(multiSnapshot({ updatedAt: 2, rows: [] }))
    saveMatrix(multiSnapshot({ sport: 'basketball', date: '2026-11-25', updatedAt: 3 }))
    saveMatrix(multiSnapshot({ date: '2026-11-26', updatedAt: 4 }))

    const entries = loadMatrixStore().entries
    expect(Object.keys(entries).sort()).toEqual(['basketball:2026-11-25', 'football:2026-11-25', 'football:2026-11-26'])
    expect(entries['football:2026-11-25'].updatedAt).toBe(2)
    expect(entries['football:2026-11-25'].rows).toEqual([])
    expect(entries['basketball:2026-11-25'].sport).toBe('basketball')
  })

  it('走 JSON 字符串往返后，同格多选顺序保持不变', () => {
    saveMatrix(multiSnapshot())
    const raw = storage.get(MATRIX_STORE_KEY) as unknown
    storage.set(MATRIX_STORE_KEY, JSON.stringify(raw))

    const cell = findMatrix('football', '2026-11-25')?.rows[0].cells[0]
    expect(cell?.options.map((option) => option.optionKey)).toEqual(['h', 'd'])
    expect(cell?.options.map((option) => option.odds)).toEqual([2.15, 3.4])
  })

  it('空 storage / 坏 JSON / 版本不符 / entries 缺失都回落空快照', () => {
    expect(loadMatrixStore()).toEqual({ version: 1, entries: {} })

    storage.set(MATRIX_STORE_KEY, '{"version":')
    expect(loadMatrixStore()).toEqual({ version: 1, entries: {} })

    storage.set(MATRIX_STORE_KEY, JSON.stringify({ version: 2, entries: {} }))
    expect(loadMatrixStore()).toEqual({ version: 1, entries: {} })

    storage.set(MATRIX_STORE_KEY, JSON.stringify({ version: 1 }))
    expect(loadMatrixStore()).toEqual({ version: 1, entries: {} })
  })

  it('丢弃结构不符的条目与格子，保留合法部分（键按内容归一化）', () => {
    storage.set(
      MATRIX_STORE_KEY,
      JSON.stringify({
        version: 1,
        entries: {
          wrongKey: multiSnapshot({ date: '2026-11-25' }),
          noSport: { version: 1, date: '2026-11-25', rows: [] },
          noRows: { version: 1, date: '2026-11-25', sport: 'football' },
          badCell: multiSnapshot({
            date: '2026-11-26',
            rows: [
              {
                matchId: 2002,
                matchNo: '002',
                league: '英超',
                home: '阿森纳',
                away: '利物浦',
                time: '23:00',
                cells: [
                  { poolCode: 'XYZ', line: '', options: [{ optionKey: 'h', label: '胜', odds: 2 }] } as never,
                  { poolCode: 'HAD', line: '', options: [] },
                  { poolCode: 'HAD', line: '', options: [{ optionKey: 'h', label: '胜', odds: 0 }] },
                  { poolCode: 'MNL', line: '', options: [{ optionKey: 'h', label: '胜', odds: 2 }] },
                ],
              },
            ],
          }),
        },
      }),
    )

    const entries = loadMatrixStore().entries
    expect(Object.keys(entries).sort()).toEqual(['football:2026-11-25', 'football:2026-11-26'])
    expect(entries['football:2026-11-26'].rows[0].cells).toEqual([])
  })

  it('旧版单选 picks 数据能读入并归一成单元素 options（不让已存数据打挂页面）', () => {
    storage.set(
      MATRIX_STORE_KEY,
      JSON.stringify({
        version: 1,
        entries: {
          'football:2026-11-25': {
            version: 1,
            date: '2026-11-25',
            sport: 'football',
            updatedAt: 1,
            rows: [
              {
                matchId: 1001,
                matchNo: '001',
                league: '欧冠',
                home: '曼城',
                away: '皇马',
                time: '03:45',
                picks: [
                  { poolCode: 'HAD', optionKey: 'h', label: '胜', odds: 2.15, line: '' },
                  { poolCode: 'HAD', optionKey: 'd', label: '平', odds: 3.4, line: '' },
                  { poolCode: 'HHAD', optionKey: 'h', label: '让胜', odds: 2.82, line: '-1' },
                ],
              },
            ],
          },
        },
      }),
    )

    const cells = findMatrix('football', '2026-11-25')?.rows[0].cells
    expect(cells).toEqual([
      {
        poolCode: 'HAD',
        line: '',
        options: [
          { optionKey: 'h', label: '胜', odds: 2.15 },
          { optionKey: 'd', label: '平', odds: 3.4 },
        ],
      },
      { poolCode: 'HHAD', line: '-1', options: [{ optionKey: 'h', label: '让胜', odds: 2.82 }] },
    ])
  })

  it('新结构缺 cells 时不会把旧 picks 字段当空：cells 为空数组即视为未选', () => {
    storage.set(
      MATRIX_STORE_KEY,
      JSON.stringify({
        version: 1,
        entries: {
          'football:2026-11-25': {
            version: 1,
            date: '2026-11-25',
            sport: 'football',
            rows: [{ matchId: 1001, cells: [], picks: [] }],
          },
        },
      }),
    )
    expect(findMatrix('football', '2026-11-25')?.rows[0].cells).toEqual([])
  })

  it('宿主存的是 JSON 字符串时也能读', () => {
    storage.set(MATRIX_STORE_KEY, JSON.stringify({ version: 1, entries: { 'football:2026-11-25': multiSnapshot() } }))
    expect(findMatrix('football', '2026-11-25')?.rows).toHaveLength(1)
  })

  it('读写存储抛错时不影响页面（读回空、写入不抛）', () => {
    getStorageSync.mockImplementation(() => {
      throw new Error('storage down')
    })
    setStorageSync.mockImplementation(() => {
      throw new Error('storage down')
    })

    expect(loadMatrixStore()).toEqual({ version: 1, entries: {} })
    expect(findMatrix('football', '2026-11-25')).toBeNull()
    expect(() => saveMatrix(multiSnapshot())).not.toThrow()
  })
})

describe('matrix-store 玩法开关', () => {
  it('默认全启用，保存后写 mc.matrix.settings.v1 并可读回', () => {
    expect(loadMatrixSettings()).toEqual(defaultMatrixSettings())

    saveMatrixSettings({ football: ['HAD', 'HAFU'], basketball: ['MNL'] })

    expect(setStorageSync).toHaveBeenCalledWith(MATRIX_SETTINGS_KEY, expect.any(Object))
    expect(loadMatrixSettings()).toEqual({ football: ['HAD', 'HAFU'], basketball: ['MNL'] })
  })

  it('设置损坏或读写抛错一律回退默认值', () => {
    storage.set(MATRIX_SETTINGS_KEY, '{oops')
    expect(loadMatrixSettings()).toEqual(defaultMatrixSettings())

    storage.set(MATRIX_SETTINGS_KEY, JSON.stringify({ football: [], basketball: [] }))
    expect(loadMatrixSettings()).toEqual(defaultMatrixSettings())

    getStorageSync.mockImplementation(() => {
      throw new Error('storage down')
    })
    expect(loadMatrixSettings()).toEqual(defaultMatrixSettings())

    setStorageSync.mockImplementation(() => {
      throw new Error('storage down')
    })
    expect(saveMatrixSettings({ football: ['TTG'], basketball: [] })).toEqual({ football: ['TTG'], basketball: [] })
  })
})
