import type { ResultPosterInput } from '../types'
import { redTicketLayout, redTicketScheme } from './red-ticket'
import type { TicketBallArea, TicketBallRow } from './red-ticket'

const SHARED = {
  qrImage: '',
  qrCaption: '微信扫码 · 每日开奖提醒',
  brandName: '彩店管理助手',
  slogan: '开奖号码 · 第一时间送达',
}

const SSQ: ResultPosterInput = {
  gameName: '双色球',
  issue: '2026132 期',
  drawDate: '11-18 周二',
  redNumbers: ['01', '07', '12', '19', '24', '31'],
  blueNumbers: ['09'],
  ...SHARED,
}

const DLT: ResultPosterInput = {
  gameName: '大乐透',
  issue: '26132 期',
  drawDate: '11-18 周三',
  redNumbers: ['03', '11', '19', '27', '33'],
  blueNumbers: ['04', '09'],
  ...SHARED,
}

const FC3D: ResultPosterInput = {
  gameName: '福彩3D',
  issue: '2026308 期',
  drawDate: '11-18 周二',
  redNumbers: ['5', '7', '2'],
  blueNumbers: [],
  ...SHARED,
}

const PL3: ResultPosterInput = {
  gameName: '排列3',
  issue: '2026308 期',
  drawDate: '11-18 周二',
  redNumbers: ['3', '8', '0'],
  blueNumbers: [],
  ...SHARED,
}

const QXC: ResultPosterInput = {
  gameName: '七星彩',
  issue: '26132 期',
  drawDate: '11-18 周二',
  redNumbers: ['0', '2', '3', '5', '7', '0'],
  blueNumbers: ['4'],
  ...SHARED,
}

const QLC: ResultPosterInput = {
  gameName: '七乐彩',
  issue: '2026132 期',
  drawDate: '11-18 周二',
  redNumbers: ['02', '09', '13', '18', '22', '27', '30'],
  blueNumbers: ['11'],
  ...SHARED,
}

const PL5: ResultPosterInput = {
  gameName: '排列5',
  issue: '26308 期',
  drawDate: '11-18 周二',
  redNumbers: ['9', '4', '5', '1', '2'],
  blueNumbers: [],
  ...SHARED,
}

const KL8: ResultPosterInput = {
  gameName: '快乐8',
  issue: '2026308 期',
  drawDate: '11-18 周二',
  redNumbers: ['02', '05', '08', '11', '14', '17', '20', '23', '26', '29', '32', '35', '38', '41', '44', '47', '50', '53', '56', '59'],
  blueNumbers: [],
  ...SHARED,
}

const CASES: readonly ResultPosterInput[] = [SSQ, DLT, FC3D, PL3, QXC, QLC, PL5, KL8]
/** 除快乐8 外，其余彩种的号码都必须排在一行里 */
const SINGLE_ROW_CASES: readonly ResultPosterInput[] = [SSQ, DLT, FC3D, PL3, QXC, QLC, PL5]
const ALL_GAMES: readonly ResultPosterInput[] = [SSQ, DLT, FC3D, PL3, QLC, KL8]

function totalBalls(item: ResultPosterInput): number {
  return item.redNumbers.length + item.blueNumbers.length
}

function rowWidth(row: TicketBallRow, area: TicketBallArea): number {
  return row.count * area.diameter + (row.count - 1) * area.gap
}

function drawnCount(area: TicketBallArea): number {
  return area.rows.reduce((sum, row) => sum + row.count, 0)
}

describe('redTicketScheme 契约', () => {
  it('id 固定为 red-ticket', () => {
    expect(redTicketScheme.id).toBe('red-ticket')
  })

  CASES.forEach((input) => {
    it(`${input.gameName}：measure 等于 layout.height，整数且在 700–1500`, () => {
      const layout = redTicketLayout([input])
      expect(redTicketScheme.measure([input])).toBe(layout.height)
      expect(Number.isInteger(layout.height)).toBe(true)
      expect(layout.height).toBeGreaterThanOrEqual(700)
      expect(layout.height).toBeLessThanOrEqual(1500)
    })
  })

  it('多彩种海报比单彩种高，且 measure 与 layout 一致', () => {
    const multi = [SSQ, DLT, KL8]
    const layout = redTicketLayout(multi)
    expect(redTicketScheme.measure(multi)).toBe(layout.height)
    expect(layout.height).toBeGreaterThan(redTicketLayout([SSQ]).height)
  })
})

describe('分节排版', () => {
  it('每个彩种对应一段，段的纵向位置随顺序递增', () => {
    const layout = redTicketLayout(ALL_GAMES)
    expect(layout.games).toHaveLength(ALL_GAMES.length)
    layout.games.forEach((block, index) => {
      expect(block.top).toBeGreaterThan(layout.card.y)
      expect(block.bottom).toBeGreaterThan(block.top)
      if (index > 0) {
        const prev = layout.games[index - 1]
        // 并排的两段共用同一个 top，换行才严格下移
        expect(block.top).toBeGreaterThanOrEqual(prev.top)
        if (block.top > prev.top) {
          expect(block.top).toBeGreaterThan(prev.bottom)
        }
      }
    })
  })

  it('号码多的彩种独占整行：宽度占满内容区', () => {
    const layout = redTicketLayout([SSQ])
    const block = layout.games[0]
    expect(block.columns).toBe(1)
    expect(block.width).toBe(542)
    expect(block.x).toBe(104)
  })

  it('相邻两个 3 号码彩种并成两列：同 top、列宽相同、x 相差列宽加列间距', () => {
    const layout = redTicketLayout([FC3D, PL3])
    expect(layout.games).toHaveLength(2)
    const [left, right] = layout.games
    expect(left.columns).toBe(2)
    expect(right.columns).toBe(2)
    expect(left.width).toBe(255)
    expect(right.width).toBe(255)
    expect(right.top).toBe(left.top)
    expect(right.x - left.x).toBe(255 + 32)
  })

  it('号码多的彩种不与邻居并排，单个 3 号码彩种也独占整行', () => {
    const mixed = redTicketLayout([FC3D, SSQ]).games
    expect(mixed[0].columns).toBe(1)
    expect(mixed[1].columns).toBe(1)
    const alone = redTicketLayout([FC3D]).games[0]
    expect(alone.columns).toBe(1)
    expect(alone.width).toBe(542)
  })

  it('段与段之间各有一条发丝线，且都落在相邻两段中间', () => {
    const layout = redTicketLayout(ALL_GAMES)
    const rows = new Set(layout.games.map((block) => block.top)).size
    expect(layout.separators).toHaveLength(rows - 1)
    layout.separators.forEach((line) => {
      expect(layout.games.some((block) => block.bottom <= line.y)).toBe(true)
      expect(layout.games.some((block) => block.top >= line.y)).toBe(true)
      expect(line.x2 - line.x1).toBe(542)
    })
  })
})

describe('号码排版', () => {
  CASES.forEach((input) => {
    it(`${input.gameName}：球都落在所属段内，数量与数据一致`, () => {
      const block = redTicketLayout([input]).games[0]
      const area = block.balls
      area.rows.forEach((row) => {
        expect(row.count).toBeGreaterThan(0)
        expect(row.startX).toBeGreaterThanOrEqual(block.x)
        expect(row.startX + rowWidth(row, area)).toBeLessThanOrEqual(block.x + block.width)
        expect(row.cy - area.diameter / 2).toBeGreaterThanOrEqual(area.top)
        expect(row.cy + area.diameter / 2).toBeLessThanOrEqual(area.bottom)
      })
      expect(area.diameter).toBeGreaterThanOrEqual(46)
      expect(area.diameter).toBeLessThanOrEqual(76)
      expect(drawnCount(area)).toBe(totalBalls(input))
      expect(area.redCount).toBe(input.redNumbers.length)
    })
  })

  SINGLE_ROW_CASES.forEach((input) => {
    it(`${input.gameName}：${totalBalls(input)} 个号码排在同一行`, () => {
      const area = redTicketLayout([input]).games[0].balls
      expect(area.rows).toHaveLength(1)
      expect(area.rows[0].count).toBe(totalBalls(input))
    })
  })

  it('快乐8 的 20 个号码占两行、每行 10 个，球径不小于 46、间距不小于 8', () => {
    const area = redTicketLayout([KL8]).games[0].balls
    expect(area.rows.map((row) => row.count)).toEqual([10, 10])
    expect(area.diameter).toBeGreaterThanOrEqual(46)
    expect(area.gap).toBeGreaterThanOrEqual(8)
    expect(area.redCount).toBe(20)
  })

  it('蓝球不再单独成行：与红球同一行、同一球径，靠 redCount 区分颜色', () => {
    const area = redTicketLayout([SSQ]).games[0].balls
    expect(area.rows).toHaveLength(1)
    expect(area.rows[0].count).toBe(7)
    expect(area.redCount).toBe(6)
  })

  it('号码行收在日期之上，且日期到号码区留白固定', () => {
    const ssq = redTicketLayout([SSQ]).games[0]
    expect(ssq.balls.bottom).toBeLessThanOrEqual(ssq.drawDate.y)
    const gap = ssq.drawDate.y - ssq.balls.bottom
    CASES.forEach((input) => {
      const block = redTicketLayout([input]).games[0]
      expect(block.drawDate.y - block.balls.bottom).toBe(gap)
    })
  })

  it('并排的两段各自收尾在自身上下界，不互相撑高', () => {
    const layout = redTicketLayout([FC3D, PL3])
    const [left, right] = layout.games
    expect(left.bottom).toBe(right.bottom)
  })
})

describe('版面约束', () => {
  it('卡片贴住左右边距、二维码在卡内、撕线位于所有彩种之后', () => {
    const layout = redTicketLayout(ALL_GAMES)
    expect(layout.card.x).toBe(48)
    expect(layout.card.x + layout.card.width).toBe(layout.width - 48)
    expect(layout.card.height).toBeGreaterThanOrEqual(580)
    expect(layout.qr.size).toBe(200)
    expect(layout.qr.x + layout.qr.size).toBeLessThanOrEqual(layout.card.x + layout.card.width)
    layout.games.forEach((block) => {
      expect(block.bottom).toBeLessThan(layout.tearY)
    })
    expect(layout.tearY).toBeGreaterThan(layout.games[layout.games.length - 1].drawDate.y)
    expect(layout.qr.y).toBeGreaterThan(layout.tearY)
    expect(layout.notches).toHaveLength(2)
    expect(layout.slogan.y).toBeGreaterThan(layout.card.y + layout.card.height)
    expect(layout.slogan.y).toBeLessThan(layout.height)
  })
})
