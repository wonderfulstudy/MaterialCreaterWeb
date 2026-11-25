import { POOL_DEFS, type PoolCode, type SportMatch } from '@/components/PlanCalculator/model'
import {
  MATRIX_POOLS,
  buildMatrixRows,
  buildMatrixSnapshot,
  checkMatrixCompleteness,
  clearPoolSelections,
  defaultMatrixSettings,
  matrixCellKey,
  matrixPoolName,
  parseMatrixSettings,
  selectedOptionKeys,
  toggleMatrixSelection,
  uniformPoolLine,
  type MatrixSelectionMap,
  type MatrixTableRow,
} from './matrix-data'

function poolRow(poolCode: PoolCode, line = '', odds = 2, oddsList?: number[]): SportMatch['rows'][number] {
  const def = POOL_DEFS[poolCode]
  return {
    poolCode,
    title: def.name,
    line,
    options: def.options.map((option, index) => ({
      key: option.key,
      label: option.label,
      odds: oddsList?.[index] ?? odds,
    })),
  }
}

function match(overrides: Partial<SportMatch> = {}): SportMatch {
  return {
    matchId: 1001,
    matchNum: 1,
    matchNumStr: '周一001',
    matchWeek: '周一',
    businessDate: '2026-11-25',
    matchDate: '2026-11-25',
    matchTime: '03:45',
    league: '欧冠',
    homeTeam: '曼城',
    awayTeam: '皇马',
    homeRank: '',
    awayRank: '',
    backColor: '',
    bettingSingle: 0,
    rows: [poolRow('HAD'), poolRow('HHAD', '-1'), poolRow('CRS')],
    ...overrides,
  }
}

function cellOf(rows: MatrixTableRow[], matchId: number, poolCode: PoolCode) {
  return rows.find((item) => item.matchId === matchId)?.cells[poolCode]
}

/** 造一格的选中态；keys 省略时取该格第一个选项，等价于点一下 */
function selectCell(
  rows: MatrixTableRow[],
  matchId: number,
  poolCode: PoolCode,
  keys?: string[],
): MatrixSelectionMap {
  const cell = cellOf(rows, matchId, poolCode)
  if (!cell) return {}
  const chosen = keys ? cell.options.filter((option) => keys.includes(option.key)) : cell.options.slice(0, 1)
  if (!chosen.length) return {}
  return {
    [matrixCellKey(matchId, poolCode)]: chosen.map((option) => ({
      poolCode,
      optionKey: option.key,
      label: option.label,
      odds: option.odds,
      line: cell.line,
    })),
  }
}

function merge(...maps: MatrixSelectionMap[]): MatrixSelectionMap {
  return maps.reduce<MatrixSelectionMap>((acc, map) => ({ ...acc, ...map }), {})
}

describe('matrix-data 玩法列', () => {
  it('足球 5 列 / 篮球 4 列，顺序与需求 §6.1.7 一致', () => {
    expect(MATRIX_POOLS.football).toEqual(['HAD', 'HHAD', 'CRS', 'TTG', 'HAFU'])
    expect(MATRIX_POOLS.basketball).toEqual(['MNL', 'HDC', 'WNM', 'HILO'])
  })

  it('列头只用中文玩法名，不带接口编码', () => {
    expect(MATRIX_POOLS.football.map(matrixPoolName)).toEqual(['胜平负', '让球胜平负', '比分', '总进球', '半全场'])
    expect(MATRIX_POOLS.basketball.map(matrixPoolName)).toEqual(['胜负', '让分胜负', '胜分差', '大小分'])
    expect([...MATRIX_POOLS.football, ...MATRIX_POOLS.basketball].map(matrixPoolName).join('')).not.toMatch(/[a-z]/)
  })

  it('默认设置启用全部玩法，返回的是副本', () => {
    const first = defaultMatrixSettings()
    const second = defaultMatrixSettings()
    expect(first).toEqual({ football: [...MATRIX_POOLS.football], basketball: [...MATRIX_POOLS.basketball] })
    first.football.pop()
    expect(second.football).toHaveLength(5)
  })
})

describe('parseMatrixSettings 解析与兜底', () => {
  it('保留勾选子集，并按固定列顺序归一（与存储里的顺序无关）', () => {
    const settings = parseMatrixSettings({ football: ['HAFU', 'HAD'], basketball: ['HILO'] })
    expect(settings.football).toEqual(['HAD', 'HAFU'])
    expect(settings.basketball).toEqual(['HILO'])
  })

  it('过滤未知编码与重复项，另一种运动缺省时保持全启用', () => {
    const settings = parseMatrixSettings({ football: ['HAD', 'XYZ', 'HAD', 'TTG'] })
    expect(settings.football).toEqual(['HAD', 'TTG'])
    expect(settings.basketball).toEqual([...MATRIX_POOLS.basketball])
  })

  it('空数组 / 坏 JSON / 非对象一律回落全部启用', () => {
    const fallback = defaultMatrixSettings()
    expect(parseMatrixSettings({ football: [], basketball: [] })).toEqual(fallback)
    expect(parseMatrixSettings('{"football":')).toEqual(fallback)
    expect(parseMatrixSettings('')).toEqual(fallback)
    expect(parseMatrixSettings(null)).toEqual(fallback)
    expect(parseMatrixSettings([1, 2])).toEqual(fallback)
  })

  it('存储里是 JSON 字符串时同样能读回', () => {
    expect(parseMatrixSettings(JSON.stringify({ football: ['CRS'], basketball: ['WNM'] }))).toEqual({
      football: ['CRS'],
      basketball: ['WNM'],
    })
  })
})

describe('buildMatrixRows 行与列映射', () => {
  it('只保留当日在售场次，并按启用玩法建格', () => {
    const matches = [
      match({ matchId: 1, matchNumStr: '周一001' }),
      match({ matchId: 2, matchNumStr: '周一002', businessDate: '2026-11-24' }),
      match({ matchId: 3, matchNumStr: '周一003', rows: [poolRow('HAD'), poolRow('TTG')] }),
    ]
    const rows = buildMatrixRows(matches, 'football', ['HAD', 'HHAD'], '2026-11-25')

    expect(rows.map((row) => row.matchId)).toEqual([1, 3])
    expect(rows[0].cells.HAD?.options.length).toBe(3)
    expect(rows[0].cells.HHAD?.line).toBe('-1')
    expect(rows[0].cells.CRS).toBeUndefined()
    expect(rows[1].cells.HHAD).toBeUndefined()
    expect(rows[0].matchNo).toBe('001')
    expect(rows[0].home).toBe('曼城')
    expect(rows[0].away).toBe('皇马')
    expect(rows[0].time).toBe('03:45')
  })

  it('没有启用玩法的场次整行丢弃', () => {
    const rows = buildMatrixRows([match({ rows: [poolRow('HAD')] })], 'football', ['HAFU'], '')
    expect(rows).toEqual([])
  })

  it('足球场次不会因为传了篮球玩法而出现篮球格', () => {
    const rows = buildMatrixRows([match()], 'football', ['MNL', 'HDC'], '')
    expect(rows).toEqual([])
  })

  it('盘口线逐场不同：uniformPoolLine 只在全表一致时返回值', () => {
    const footballRows = buildMatrixRows(
      [
        match({ matchId: 1, rows: [poolRow('HHAD', '-1')] }),
        match({ matchId: 2, rows: [poolRow('HHAD', '-2')] }),
      ],
      'football',
      ['HHAD'],
      '',
    )
    expect(uniformPoolLine(footballRows, 'HHAD')).toBe('')

    const basketballRows = buildMatrixRows(
      [
        match({ matchId: 1, rows: [poolRow('HILO', '220.5')] }),
        match({ matchId: 2, rows: [poolRow('HILO', '220.5')] }),
      ],
      'basketball',
      ['HILO'],
      '',
    )
    expect(uniformPoolLine(basketballRows, 'HILO')).toBe('220.5')
    expect(uniformPoolLine(basketballRows, 'HAD')).toBe('')
  })
})

describe('toggleMatrixSelection 复式点选', () => {
  const rows = buildMatrixRows([match()], 'football', ['HAD'], '')
  const cell = cellOf(rows, 1001, 'HAD')!
  const [first, second] = cell.options
  const target = { matchId: 1001, poolCode: 'HAD' as PoolCode, line: '' }

  it('同一格选两个结果 → 两个都在，且不互相顶掉', () => {
    const once = toggleMatrixSelection({}, target, first)
    const twice = toggleMatrixSelection(once, target, second)

    expect(twice[matrixCellKey(1001, 'HAD')].map((pick) => pick.optionKey)).toEqual([first.key, second.key])
    expect(twice[matrixCellKey(1001, 'HAD')][1]).toEqual({
      poolCode: 'HAD',
      optionKey: second.key,
      label: second.label,
      odds: second.odds,
      line: '',
    })
    // 原对象不被改写
    expect(once[matrixCellKey(1001, 'HAD')]).toHaveLength(1)
  })

  it('点已选中的结果 → 从该格移除，其它的保留', () => {
    const both = toggleMatrixSelection(toggleMatrixSelection({}, target, first), target, second)
    const after = toggleMatrixSelection(both, target, first)
    expect(after[matrixCellKey(1001, 'HAD')].map((pick) => pick.optionKey)).toEqual([second.key])
  })

  it('移除到空 → 该格回到未填（键被删掉）', () => {
    const once = toggleMatrixSelection({}, target, first)
    const after = toggleMatrixSelection(once, target, first)
    expect(after).toEqual({})
    expect(selectedOptionKeys(after[matrixCellKey(1001, 'HAD')]).size).toBe(0)
  })

  it('不同场次的同玩法是各自独立的格子', () => {
    const twoRows = buildMatrixRows(
      [match({ matchId: 1 }), match({ matchId: 2, matchNumStr: '周一002' })],
      'football',
      ['HAD'],
      '',
    )
    const otherCell = cellOf(twoRows, 2, 'HAD')!
    const next = toggleMatrixSelection(
      toggleMatrixSelection({}, { matchId: 1, poolCode: 'HAD', line: '' }, cell.options[0]),
      { matchId: 2, poolCode: 'HAD', line: '' },
      otherCell.options[1],
    )
    expect(Object.keys(next).sort()).toEqual([matrixCellKey(1, 'HAD'), matrixCellKey(2, 'HAD')].sort())
  })
})

describe('checkMatrixCompleteness 完整度校验', () => {
  const matches = [
    match({ matchId: 1, rows: [poolRow('HAD'), poolRow('HHAD', '-1')] }),
    match({ matchId: 2, rows: [poolRow('HAD'), poolRow('HHAD', '-1')] }),
  ]
  const pools: PoolCode[] = ['HAD', 'HHAD']

  it('统计缺少的格子数与场次数', () => {
    const rows = buildMatrixRows(matches, 'football', pools, '')
    const selections = merge(selectCell(rows, 1, 'HAD'), selectCell(rows, 2, 'HAD'))
    const result = checkMatrixCompleteness(rows, pools, selections)

    expect(result).toEqual({
      cellCount: 4,
      filledCount: 2,
      missingCount: 2,
      missingRowCount: 2,
      complete: false,
    })
  })

  it('全部选齐才算完整', () => {
    const rows = buildMatrixRows(matches, 'football', pools, '')
    const selections = merge(
      selectCell(rows, 1, 'HAD'),
      selectCell(rows, 1, 'HHAD'),
      selectCell(rows, 2, 'HAD'),
      selectCell(rows, 2, 'HHAD'),
    )
    expect(checkMatrixCompleteness(rows, pools, selections)).toMatchObject({ missingCount: 0, missingRowCount: 0, complete: true })
  })

  it('一格选多个结果仍然只算一格：footer 的已选格数不因复式变化', () => {
    const rows = buildMatrixRows(matches, 'football', pools, '')
    const single = merge(
      selectCell(rows, 1, 'HAD'),
      selectCell(rows, 1, 'HHAD'),
      selectCell(rows, 2, 'HAD'),
      selectCell(rows, 2, 'HHAD'),
    )
    const doubled = merge(
      selectCell(rows, 1, 'HAD', [cellOf(rows, 1, 'HAD')!.options[0].key, cellOf(rows, 1, 'HAD')!.options[1].key]),
      selectCell(rows, 1, 'HHAD'),
      selectCell(rows, 2, 'HAD'),
      selectCell(rows, 2, 'HHAD'),
    )
    expect(doubled[matrixCellKey(1, 'HAD')]).toHaveLength(2)
    expect(checkMatrixCompleteness(rows, pools, doubled)).toEqual(checkMatrixCompleteness(rows, pools, single))
    expect(checkMatrixCompleteness(rows, pools, doubled).filledCount).toBe(4)
  })

  it('无赔率的格子不计入，也永远不算「完整」当表为空', () => {
    const rows = buildMatrixRows([match({ rows: [poolRow('HAD')] })], 'football', ['HAD', 'CRS'], '')
    expect(checkMatrixCompleteness(rows, ['HAD', 'CRS'], {})).toMatchObject({ cellCount: 1, missingCount: 1 })
    expect(checkMatrixCompleteness([], pools, {})).toMatchObject({ cellCount: 0, complete: false })
  })
})

describe('buildMatrixSnapshot 快照构建', () => {
  it('按列顺序落 cells，赔率/盘口线取保存当刻的实时值', () => {
    const rows = buildMatrixRows([match()], 'football', ['HAD', 'HHAD'], '2026-11-25')
    const selections: MatrixSelectionMap = {
      [matrixCellKey(1001, 'HHAD')]: [{ poolCode: 'HHAD', optionKey: 'h', label: '让胜', odds: 9.99, line: '旧线' }],
      [matrixCellKey(1001, 'HAD')]: [{ poolCode: 'HAD', optionKey: 'd', label: '平', odds: 3.1, line: '' }],
    }

    const snapshot = buildMatrixSnapshot({
      date: '2026-11-25',
      sport: 'football',
      rows,
      pools: ['HAD', 'HHAD'],
      selections,
      updatedAt: 1735689600000,
    })

    expect(snapshot).toMatchObject({ version: 1, date: '2026-11-25', sport: 'football', updatedAt: 1735689600000 })
    expect(snapshot.rows).toHaveLength(1)
    expect(snapshot.rows[0]).toMatchObject({
      matchId: 1001,
      matchNo: '001',
      league: '欧冠',
      home: '曼城',
      away: '皇马',
      time: '03:45',
    })
    expect(snapshot.rows[0].cells.map((cell) => cell.poolCode)).toEqual(['HAD', 'HHAD'])
    expect(snapshot.rows[0].cells[0]).toEqual({
      poolCode: 'HAD',
      line: '',
      options: [{ optionKey: 'd', label: '平', odds: 2 }],
    })
    expect(snapshot.rows[0].cells[1]).toEqual({
      poolCode: 'HHAD',
      line: '-1',
      options: [{ optionKey: 'h', label: '让胜', odds: 2 }],
    })
  })

  it('复式一格写多个 options，顺序跟表格选项顺序走（不是点选顺序）', () => {
    const def = POOL_DEFS.HAD.options
    const rows = buildMatrixRows([match({ rows: [poolRow('HAD', '', 2, [1.5, 3.2, 6.4])] })], 'football', ['HAD'], '')
    const cell = cellOf(rows, 1001, 'HAD')!
    const reverse = [cell.options[2].key, cell.options[0].key]
    const snapshot = buildMatrixSnapshot({
      date: '2026-11-25',
      sport: 'football',
      rows,
      pools: ['HAD'],
      selections: selectCell(rows, 1001, 'HAD', reverse),
      updatedAt: 7,
    })

    expect(snapshot.rows[0].cells).toHaveLength(1)
    expect(snapshot.rows[0].cells[0].options).toEqual([
      { optionKey: def[0].key, label: def[0].label, odds: 1.5 },
      { optionKey: def[2].key, label: def[2].label, odds: 6.4 },
    ])
  })

  it('未选 / 已失效的选项不产出 cell，未启用的玩法不写入快照', () => {
    const rows = buildMatrixRows([match()], 'football', ['HAD', 'HHAD'], '')
    const snapshot = buildMatrixSnapshot({
      date: '2026-11-25',
      sport: 'football',
      rows,
      pools: ['HAD', 'HHAD'],
      selections: {
        [matrixCellKey(1001, 'HAD')]: [{ poolCode: 'HAD', optionKey: 'gone', label: '已下架', odds: 2, line: '' }],
        [matrixCellKey(1001, 'CRS')]: [{ poolCode: 'CRS', optionKey: 's00s00', label: '0:0', odds: 8, line: '' }],
      },
      updatedAt: 1,
    })
    expect(snapshot.rows[0].cells).toEqual([])
  })
})

describe('clearPoolSelections 关闭玩法清列', () => {
  it('只删该玩法在所有场次的已选（含复式整格），其它列保留', () => {
    const selections: MatrixSelectionMap = {
      [matrixCellKey(1, 'HAD')]: [
        { poolCode: 'HAD', optionKey: 'h', label: '胜', odds: 2, line: '' },
        { poolCode: 'HAD', optionKey: 'd', label: '平', odds: 3, line: '' },
      ],
      [matrixCellKey(1, 'HHAD')]: [{ poolCode: 'HHAD', optionKey: 'a', label: '让负', odds: 3, line: '-1' }],
      [matrixCellKey(2, 'HAD')]: [{ poolCode: 'HAD', optionKey: 'd', label: '平', odds: 3, line: '' }],
    }
    const next = clearPoolSelections(selections, 'HAD')
    expect(Object.keys(next)).toEqual([matrixCellKey(1, 'HHAD')])
    expect(Object.keys(selections)).toHaveLength(3)
  })
})
