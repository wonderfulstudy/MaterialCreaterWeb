import {
  POSTER_PAGE_MAX_HEIGHT,
  planRecordPages,
  posterPageHeights,
  type PosterPagingInput,
  type PosterRecordPage,
} from './model'

jest.mock('@tarojs/taro', () => ({
  __esModule: true,
  default: {
    getStorageSync: jest.fn(),
    setStorageSync: jest.fn(),
    removeStorageSync: jest.fn(),
  },
}))

const MAX = POSTER_PAGE_MAX_HEIGHT

/** 把分张结果换算回每张的成品高度：第 1 张带封面，第 2 张起只重复页顶 + 表头，说明只跟最后一张 */
function pageHeights(ranges: PosterRecordPage[], input: PosterPagingInput): number[] {
  const rowSum = (page: PosterRecordPage): number =>
    input.rowHeights.slice(page.start, page.end).reduce((total, value) => total + value, 0)
  return ranges.map((page, index) => {
    const fixed = index === 0 ? input.firstFixed : input.repeatFixed
    const tail = index === ranges.length - 1 ? input.tailFixed : 0
    return fixed + rowSum(page) + tail
  })
}

/** 均匀行高：rowCount 行，每行 rowHeight 成品 px */
function rowsOf(rowCount: number, rowHeight = 100): number[] {
  return Array.from({ length: rowCount }, () => rowHeight)
}

describe('posterPageHeights 张数判定', () => {
  it('内容 2500px 不超阈值 → 单张', () => {
    const heights = posterPageHeights(2500)
    expect(heights).toHaveLength(1)
    expect(heights[0]).toBe(2500)
  })

  it('内容 3010px（刚好过 3000）→ 两张，且每张 ≤ 3000', () => {
    const heights = posterPageHeights(3010)
    expect(heights).toHaveLength(2)
    expect(Math.max(...heights)).toBeLessThanOrEqual(MAX)
    // 第 2 张多背一条重复页顶 + 表头，总和 = 内容 + repeat
    expect(heights.reduce((total, value) => total + value, 0)).toBeCloseTo(3010 + 96, 6)
  })

  it('内容 6000px → 三张，且每张 ≤ 3000', () => {
    const heights = posterPageHeights(6000)
    expect(heights).toHaveLength(3)
    heights.forEach((value) => expect(value).toBeLessThanOrEqual(MAX))
  })

  it('恰好等于阈值仍算单张，阈值上浮 1px 才分张', () => {
    expect(posterPageHeights(3000)).toHaveLength(1)
    expect(posterPageHeights(3001)).toHaveLength(2)
  })
})

describe('planRecordPages 按行边界分张', () => {
  it('内容 2500px → 一张装下全部 20 行', () => {
    const input: PosterPagingInput = {
      rowHeights: rowsOf(20),
      firstFixed: 300,
      repeatFixed: 100,
      tailFixed: 200,
    }
    const pages = planRecordPages(input)
    expect(pages).toEqual([{ start: 0, end: 20 }])
    expect(pageHeights(pages, input)).toEqual([2500])
  })

  it('内容 3010px → 两张，每张 ≤ 3000，行不丢不重、切点在行边界', () => {
    const input: PosterPagingInput = {
      rowHeights: rowsOf(25),
      firstFixed: 310,
      repeatFixed: 100,
      tailFixed: 200,
    }
    const pages = planRecordPages(input)
    expect(pages).toHaveLength(2)
    expect(pages[0].start).toBe(0)
    expect(pages[1].start).toBe(pages[0].end)
    expect(pages[pages.length - 1].end).toBe(25)
    pageHeights(pages, input).forEach((value) => expect(value).toBeLessThanOrEqual(MAX))
  })

  it('内容 6000px → 三张，每张 ≤ 3000，第 2 张起重复页顶 + 表头', () => {
    const input: PosterPagingInput = {
      rowHeights: rowsOf(57),
      firstFixed: 200,
      repeatFixed: 100,
      tailFixed: 100,
    }
    const pages = planRecordPages(input)
    expect(pages).toHaveLength(3)
    expect(pages).toEqual([
      { start: 0, end: 18 },
      { start: 18, end: 38 },
      { start: 38, end: 57 },
    ])
    expect(pageHeights(pages, input)).toEqual([2000, 2100, 2100])
  })

  it('说明 + 引流只跟最后一张：装不下就把末尾的行挪到新的一张', () => {
    const input: PosterPagingInput = {
      rowHeights: rowsOf(20),
      firstFixed: 100,
      repeatFixed: 100,
      tailFixed: 500,
      maxHeight: 1000,
    }
    const pages = planRecordPages(input)
    expect(pages).toEqual([
      { start: 0, end: 7 },
      { start: 7, end: 15 },
      { start: 15, end: 19 },
      { start: 19, end: 20 },
    ])
    pageHeights(pages, input).forEach((value) => expect(value).toBeLessThanOrEqual(1000))
  })

  it('真实 B 卡几何：50 行整张 2993px 仍是单张，不回归', () => {
    // 页顶 28.5 + 封面 188 + 表头 28 = 244.5 CSS px；行 22.4；说明 32 + 引流 100 = 132
    const input: PosterPagingInput = {
      rowHeights: rowsOf(50, 22.4 * 2),
      firstFixed: 244.5 * 2,
      repeatFixed: (28.5 + 28) * 2,
      tailFixed: 132 * 2,
    }
    const pages = planRecordPages(input)
    expect(pages).toEqual([{ start: 0, end: 50 }])
    const heights = pageHeights(pages, input)
    expect(heights).toHaveLength(1)
    expect(heights[0]).toBeCloseTo(2993, 6)
  })

  it('真实 B 卡几何：60 行 3441px → 两张，两张都 ≤ 3000 且第 2 张带重复表头', () => {
    const input: PosterPagingInput = {
      rowHeights: rowsOf(60, 22.4 * 2),
      firstFixed: 244.5 * 2,
      repeatFixed: (28.5 + 28) * 2,
      tailFixed: 132 * 2,
    }
    const pages = planRecordPages(input)
    expect(pages).toHaveLength(2)
    expect(pages[0].start).toBe(0)
    expect(pages[1].start).toBe(pages[0].end)
    expect(pages[1].end).toBe(60)
    const heights = pageHeights(pages, input)
    expect(heights).toHaveLength(2)
    heights.forEach((value) => expect(value).toBeLessThanOrEqual(MAX))
    // 第 2 张的固定高度包含重复的页顶 + 表头
    expect(heights[1]).toBeGreaterThan(input.repeatFixed)
  })

  it('没有行或量不到高度时退化成单张，不产生空页', () => {
    expect(planRecordPages({ rowHeights: [], firstFixed: 300, repeatFixed: 100, tailFixed: 200 })).toEqual([
      { start: 0, end: 0 },
    ])
  })
})
