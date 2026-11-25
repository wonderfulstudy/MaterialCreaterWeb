import type {
  MatrixSnapshot,
  MatrixSnapshotCell,
  MatrixSnapshotRow,
  MatrixSnapshotOption,
} from '@/pages/matrix/matrix-data'
import {
  MATRIX_EMPTY_TEXT,
  MATRIX_POSTER_HEADER_HEIGHT,
  MATRIX_POSTER_MAX_HEIGHT,
  MATRIX_POSTER_REPEAT_HEIGHT,
  MATRIX_POSTER_ROW_HEIGHT,
  MATRIX_POSTER_TABLE_HEAD_HEIGHT,
  MATRIX_POSTER_TAIL_HEIGHT,
  MATRIX_POSTER_TITLE,
  buildMatrixPosterModel,
  matrixDateLabel,
  matrixPosterPages,
} from './model'

function option(optionKey: string, label: string, odds: number): MatrixSnapshotOption {
  return { optionKey, label, odds }
}

function cell(poolCode: string, options: MatrixSnapshotOption[]): MatrixSnapshotCell {
  return { poolCode: poolCode as MatrixSnapshotCell['poolCode'], line: '', options }
}

function row(index: number, cells: MatrixSnapshotCell[]): MatrixSnapshotRow {
  const no = String(index + 1).padStart(3, '0')
  return {
    matchId: index + 1,
    matchNo: no,
    league: '英超',
    home: '主队',
    away: '客队',
    time: '20:00',
    cells,
  }
}

function snapshot(cells: MatrixSnapshotCell[][], sport: MatrixSnapshot['sport'] = 'football'): MatrixSnapshot {
  return {
    version: 1,
    date: '2026-11-25',
    sport,
    rows: cells.map((item, index) => row(index, item)),
    updatedAt: 1,
  }
}

describe('矩阵海报行模型', () => {
  it('只渲染快照里出现过的玩法列，顺序沿用 MATRIX_POOLS', () => {
    const model = buildMatrixPosterModel(
      snapshot([
        [cell('TTG', [option('s0', '0球', 3.15)]), cell('HAD', [option('h', '胜', 1.2)])],
        [cell('HAD', [option('h', '胜', 1.35)])],
      ])
    )
    expect(model.columns.map(({ poolCode }) => poolCode)).toEqual(['HAD', 'TTG'])
    expect(model.columns.map(({ name }) => name)).toEqual(['胜平负', '总进球'])
    expect(model.rows[0].cells).toHaveLength(2)
  })

  it('复式按快照 options 顺序用 / 连写，赔率两位小数', () => {
    const model = buildMatrixPosterModel(
      snapshot([[cell('HAD', [option('h', '胜', 1.2), option('d', '平', 5.6)])]])
    )
    expect(model.rows[0].cells[0]).toEqual({ label: '胜 / 平', odds: '1.20 / 5.60', empty: false })
  })

  it('没有 cell 的格子与选项为空的格子都显示 —', () => {
    const model = buildMatrixPosterModel(snapshot([[cell('HAD', []), cell('TTG', [option('s0', '0球', 3.15)])]]))
    expect(model.columns.map(({ poolCode }) => poolCode)).toEqual(['HAD', 'TTG'])
    expect(model.rows[0].cells[0]).toEqual({ label: MATRIX_EMPTY_TEXT, odds: '', empty: true })
    expect(model.rows[0].cells[1].label).toBe('0球')
  })

  it('标题、日期与运动名', () => {
    const football = buildMatrixPosterModel(snapshot([[cell('HAD', [option('h', '胜', 1.2)])]]))
    expect(football.title).toBe(MATRIX_POSTER_TITLE)
    expect(football.dateLabel).toBe('11-25 周三')
    expect(football.sportLabel).toBe('足球')
    const basketball = buildMatrixPosterModel(snapshot([[cell('MNL', [option('sh', '主胜', 1.7)])]], 'basketball'))
    expect(basketball.sportLabel).toBe('篮球')
    expect(basketball.columns.map(({ poolCode }) => poolCode)).toEqual(['MNL'])
  })

  it('场次行拼出主客队文案', () => {
    const model = buildMatrixPosterModel(snapshot([[cell('HAD', [option('h', '胜', 1.2)])]]))
    expect(model.rows[0].matchNo).toBe('001')
    expect(model.rows[0].time).toBe('20:00')
    expect(model.rows[0].teams).toBe('主队 VS 客队')
  })
})

describe('海报日期文案', () => {
  it('解析 YYYY-MM-DD 成 MM-DD 周几', () => {
    expect(matrixDateLabel('2026-11-25')).toBe('11-25 周三')
    expect(matrixDateLabel('2026-11-27')).toBe('11-27 周五')
  })

  it('解析不了就原样返回', () => {
    expect(matrixDateLabel('')).toBe('')
    expect(matrixDateLabel('11-25')).toBe('11-25')
  })
})

describe('长图分张', () => {
  it('内容不超过 3000px 时只有一张，且带页脚', () => {
    const pages = matrixPosterPages(10)
    expect(pages).toHaveLength(1)
    expect(pages[0]).toMatchObject({ start: 0, end: 10, repeatHeader: false, withFooter: true })
  })

  it('没有场次时也给出单张空表', () => {
    expect(matrixPosterPages(0)).toEqual([{ start: 0, end: 0, repeatHeader: false, withFooter: true }])
  })

  it('超过 3000px 时切点落在场次行边界，第 2 张起重复表头', () => {
    const total = 120
    const pages = matrixPosterPages(total)
    expect(pages.length).toBeGreaterThan(1)
    expect(pages[0].start).toBe(0)
    expect(pages[pages.length - 1].end).toBe(total)
    pages.forEach((page, index) => {
      expect(page.end).toBeGreaterThan(page.start)
      if (index > 0) {
        expect(page.start).toBe(pages[index - 1].end)
        expect(page.repeatHeader).toBe(true)
      }
      expect(page.withFooter).toBe(index === pages.length - 1)
    })
    // 第 2 张起只为表头重复留高度
    expect(MATRIX_POSTER_REPEAT_HEIGHT).toBe(MATRIX_POSTER_TABLE_HEAD_HEIGHT)
  })

  it('按内容均摊分张，页数与总高匹配且不会无谓多切一张', () => {
    const total = 60
    const pages = matrixPosterPages(total)
    const counts = pages.map((page) => page.end - page.start)
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(3)
    const content =
      MATRIX_POSTER_HEADER_HEIGHT + MATRIX_POSTER_TABLE_HEAD_HEIGHT + total * MATRIX_POSTER_ROW_HEIGHT + MATRIX_POSTER_TAIL_HEIGHT
    const expected = Math.ceil(
      (content - MATRIX_POSTER_REPEAT_HEIGHT) / (MATRIX_POSTER_MAX_HEIGHT - MATRIX_POSTER_REPEAT_HEIGHT)
    )
    expect(pages.length).toBeGreaterThanOrEqual(expected)
    expect(pages.length).toBeLessThanOrEqual(expected + 1)
  })
})
